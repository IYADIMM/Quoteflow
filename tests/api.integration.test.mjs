import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { createHandler, reserveAIUsage, sanitizedRequestPath } from '../netlify/functions/api.mjs';

const config = { production: false, appUrl: 'https://quoteflow.test', databaseUrl: 'postgres://test', ai: { enabled: true, configured: true, apiKey: 'test-only', model: 'gemini-test', maxRequestsPerMinute: 5, maxInputChars: 2000, monthlyLimits: { FREE: 25, PRO: 500, BUSINESS: 5000 } }, email: { provider: '', apiKey: '', from: '' } };
const response = async event => {
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => ({ $queryRaw: async () => [{ '?column?': 1 }], session: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }) } }) });
  const result = await handler(event);
  return { status: result.statusCode, body: JSON.parse(result.body), headers: result.headers };
};

test('Netlify API reports safe AI configuration and checks PostgreSQL health', async () => {
  const aiHealth = await response({ path: '/api/ai/health', httpMethod: 'GET', headers: {} });
  assert.equal(aiHealth.status, 200);
  assert.deepEqual(aiHealth.body, { enabled: true, configured: true, provider: 'gemini', model: 'gemini-test' });
  assert.equal(JSON.stringify(aiHealth.body).includes('test-only'), false);
  const health = await response({ path: '/api/health', httpMethod: 'GET', headers: {} });
  assert.equal(health.status, 200);
  assert.equal(health.body.database, 'postgresql');
});

test('Netlify API rejects unauthenticated business requests and cookie mutations without CSRF token', async () => {
  const unauthenticated = await response({ path: '/api/customers', httpMethod: 'GET', headers: {} });
  assert.equal(unauthenticated.status, 401);
  const csrf = await response({ path: '/api/ai/extract-rfq', httpMethod: 'POST', headers: { origin: config.appUrl, cookie: 'qf_session=abc; qf_csrf=good' }, body: JSON.stringify({ text: 'Desk x 4' }) });
  assert.equal(csrf.status, 403);
});

test('signup and login persist salted password hashes and issue HttpOnly tenant sessions', async () => {
  let savedUser, savedSession;
  const prisma = {
    $transaction: async fn => fn({
      user: { create: async ({ data }) => (savedUser = { id: 'user-1', ...data }) },
      organization: { create: async ({ data }) => ({ id: 'org-1', name: data.name }) },
      membership: { create: async () => ({ id: 'membership-1' }) },
      session: { create: async ({ data }) => (savedSession = data) }
    }),
    user: { findUnique: async () => ({ ...savedUser, memberships: [{ organizationId: 'org-1', role: 'OWNER', organization: { id: 'org-1', name: 'Example Ltd' } }] }) },
    session: { create: async ({ data }) => (savedSession = data) }
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma, emailProvider: () => null });
  const signup = await handler({ path: '/api/auth/signup', httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ email: 'owner@example.test', organization: 'Example Ltd', password: 'correct-horse-battery-staple' }) });
  assert.equal(signup.statusCode, 201);
  assert.ok(savedUser.passwordHash.includes(':'));
  assert.equal(JSON.stringify(JSON.parse(signup.body)).includes(savedUser.passwordHash), false);
  assert.equal(signup.multiValueHeaders['set-cookie'].length, 2);
  assert.match(signup.multiValueHeaders['set-cookie'][0], /HttpOnly/);
  const login = await handler({ path: '/api/auth/login', httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ email: 'owner@example.test', password: 'correct-horse-battery-staple' }) });
  assert.equal(login.statusCode, 200);
  assert.deepEqual(JSON.parse(login.body).memberships.map(m => m.role), ['OWNER']);
  assert.equal(savedSession.organizationId, 'org-1');
  const badLogin = await handler({ path: '/api/auth/login', httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ email: 'owner@example.test', password: 'wrong-password-value' }) });
  assert.equal(badLogin.statusCode, 401);
});

test('multi-organization sessions switch only after membership validation and re-scope role and data', async () => {
  const token = 'multi-org-session';
  let activeOrg = 'org-a';
  const orgs = { 'org-a': { id: 'org-a', name: 'Alpha', reportingCurrency: 'AED' }, 'org-b': { id: 'org-b', name: 'Beta', reportingCurrency: 'USD' } };
  const roles = { 'org-a': 'OWNER', 'org-b': 'VIEWER' };
  const memberships = Object.entries(roles).map(([organizationId, role]) => ({ userId: 'user-1', organizationId, role, organization: orgs[organizationId] }));
  const prisma = {
    session: {
      findUnique: async ({ where }) => where.tokenHash === createHash('sha256').update(token).digest('hex') ? { id: 'session-1', userId: 'user-1', organizationId: activeOrg, expiresAt: new Date(Date.now() + 60_000), user: { id: 'user-1', email: 'multi@example.test' }, organization: orgs[activeOrg] } : null,
      updateMany: async ({ where, data }) => { if (where.id !== 'session-1' || where.userId !== 'user-1') return { count: 0 }; activeOrg = data.organizationId; return { count: 1 }; }
    },
    membership: {
      findUnique: async ({ where }) => memberships.find(m => m.userId === where.userId_organizationId.userId && m.organizationId === where.userId_organizationId.organizationId) || null,
      findMany: async ({ where }) => memberships.filter(m => m.userId === where.userId)
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
    customer: { findMany: async ({ where }) => [{ companyName: where.organizationId === 'org-a' ? 'Alpha customer' : 'Beta customer' }] },
    catalogItem: { findMany: async ({ where }) => [{ id: `${where.organizationId}-catalog`, name: `${where.organizationId} catalog`, cost: 10, sellingPrice: 20, taxRate: 5 }] },
    quote: { findMany: async ({ where }) => [{ id: `${where.organizationId}-quote`, number: `${where.organizationId}-quote`, status: 'DRAFT', discount: 0, items: [] }] }
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const call = async (path, method = 'GET', body = {}) => handler({ path: `/api${path}`, httpMethod: method, headers: { cookie: `qf_session=${token}; qf_csrf=valid`, 'x-csrf-token': 'valid', origin: config.appUrl }, body: JSON.stringify(body) });
  const before = JSON.parse((await call('/auth/me')).body);
  assert.equal(before.organization.id, 'org-a');
  assert.deepEqual(before.memberships.map(m => m.role), ['OWNER', 'VIEWER']);
  const denied = await call('/auth/switch-organization', 'POST', { organizationId: 'org-forged' });
  assert.equal(denied.statusCode, 403);
  assert.equal(activeOrg, 'org-a');
  const switched = await call('/auth/switch-organization', 'POST', { organizationId: 'org-b' });
  assert.equal(switched.statusCode, 200);
  assert.equal(JSON.parse(switched.body).role, 'VIEWER');
  assert.equal(activeOrg, 'org-b');
  const after = JSON.parse((await call('/auth/me')).body);
  assert.equal(after.organization.id, 'org-b');
  assert.equal(after.role, 'VIEWER');
  const customers = JSON.parse((await call('/customers')).body);
  assert.equal(customers.items[0].companyName, 'Beta customer');
  const catalog = JSON.parse((await call('/products')).body);
  assert.equal(catalog.items[0].name, 'org-b catalog');
  const quotes = JSON.parse((await call('/quotes')).body);
  assert.equal(quotes.items[0].number, 'org-b-quote');
});

test('AI request reservations atomically enforce plan and hashed-IP limits before provider calls', async () => {
  let created;
  const prisma = {
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn({
      aiUsage: { count: async ({ where }) => where.requestKey ? 0 : 0, create: async ({ data }) => (created = { id: 'usage-1', ...data }) },
      subscription: { findUnique: async () => ({ plan: 'FREE' }) }
    }); }
  };
  const reserved = await reserveAIUsage(prisma, 'org-1', 'extract-rfq', config, '203.0.113.4');
  assert.equal(reserved.id, 'usage-1');
  assert.equal(created.success, false);
  assert.notEqual(created.requestKey, '203.0.113.4');
  const limitedDb = { ...prisma, $transaction: async fn => fn({ aiUsage: { count: async ({ where }) => where.createdAt.gte.getDate() === 1 ? 25 : 0 }, subscription: { findUnique: async () => ({ plan: 'FREE' }) } }) };
  assert.deepEqual(await reserveAIUsage(limitedDb, 'org-1', 'extract-rfq', config, '203.0.113.4'), { limited: 'limit' });
});

test('public quote viewing records activity without incrementing its commercial version', async () => {
  const token = 'public-token'; let storedVersion = 4, viewedAt = null, eventType;
  const quote = { id: 'quote-1', organizationId: 'org-1', status: 'SENT', version: 4, publicTokenExpiresAt: new Date(Date.now() + 86_400_000), expiryDate: null, snapshot: { version: 4, items: [], totals: { subtotal: 10, tax: 0.5, total: 10.5 }, customer: {}, company: {}, terms: {} } };
  const prisma = { quote: { findFirst: async () => ({ ...quote, version: storedVersion }) }, $transaction: async fn => fn({ quote: { updateMany: async ({ data }) => { if (data.version) storedVersion += data.version.increment; viewedAt = data.viewedAt; return { count: 1 }; } }, quoteEvent: { create: async ({ data }) => { eventType = data.type; } } }) };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const result = await handler({ path: `/api/public/quote/${token}`, httpMethod: 'GET', headers: {} });
  assert.equal(result.statusCode, 200);
  assert.equal(storedVersion, 4);
  assert.ok(viewedAt);
  assert.equal(eventType, 'VIEWED');
});

test('public customer question is retained when seller notification email fails', async () => {
  let savedEvent;
  const prisma = { quote: { findFirst: async () => ({ id: 'quote-1', number: 'Q-1', organizationId: 'org-1', status: 'SENT', version: 2, publicTokenExpiresAt: new Date(Date.now() + 86_400_000), expiryDate: null, snapshot: {} }) }, quoteEvent: { create: async ({ data }) => { savedEvent = data; } }, companySettings: { findUnique: async () => ({ data: { email: 'sales@example.test' } }) } };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma, emailProvider: () => ({ send: async () => { throw new Error('provider unavailable'); } }) });
  const result = await handler({ path: '/api/public/quote/question-token', httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ action: 'question', name: 'Buyer', email: 'buyer@example.test', message: 'Can you confirm delivery timing?' }) });
  assert.equal(result.statusCode, 200);
  assert.equal(savedEvent.type, 'CUSTOMER_QUESTION');
  assert.equal(savedEvent.metadata.message, 'Can you confirm delivery timing?');
});

test('public responses reject expired quotes', async () => {
  const token = 'expired-token';
  const prisma = { quote: { findFirst: async () => ({ id: 'quote-1', organizationId: 'org-1', status: 'SENT', version: 3, publicTokenExpiresAt: new Date(Date.now() + 86_400_000), expiryDate: new Date(Date.now() - 60_000), snapshot: {} }) } };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const result = await handler({ path: `/api/public/quote/${token}`, httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ action: 'accept', name: 'Buyer', email: 'buyer@example.test', agree: true }) });
  assert.equal(result.statusCode, 404);
});

test('a same-key retry after send finalization is idempotent without persisting the raw bearer link', async () => {
  const sessionToken = 'send-session', requestKey = 'retry-key-123';
  const quote = { id: 'quote-1', organizationId: 'org-1', status: 'SENT', version: 7, sendAttemptKey: requestKey, sendAttemptState: 'SENT', snapshot: { publicUrl: 'https://quoteflow.test/q/issued' }, deletedAt: null };
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'user-1', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'user-1', emailVerifiedAt: new Date() }, organization: { id: 'org-1', reportingCurrency: 'AED' } }) },
    membership: { findUnique: async () => ({ role: 'SALES_REP' }) },
    quote: { findFirst: async () => quote }
  };
  let emailCalls = 0;
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma, emailProvider: () => ({ send: async () => { emailCalls++; } }) });
  const result = await handler({ path: '/api/quotes/quote-1/send', httpMethod: 'POST', headers: { cookie: `qf_session=${sessionToken}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: JSON.stringify({ idempotencyKey: requestKey }) });
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).duplicate, true);
  assert.equal(JSON.parse(result.body).publicUrl, null);
  assert.equal(emailCalls, 0);
});

test('billing checkout is server-authorized and uses the active session organization', async () => {
  const sessionToken = 'billing-session';
  const billingConfig = { ...config, stripe: { enabled: true, secretKey: 'sk_test', webhookSecret: 'whsec_test', prices: { PRO: 'price_pro', BUSINESS: 'price_business' } }, storage: { enabled: false }, pdf: {} };
  const makePrisma = role => ({
    session: { findUnique: async () => ({ id: 'session-1', userId: 'user-1', organizationId: 'org-a', expiresAt: new Date(Date.now() + 60_000), user: { id: 'user-1', email: 'owner@example.test', emailVerifiedAt: new Date() }, organization: { id: 'org-a', name: 'Alpha', reportingCurrency: 'AED' } }) },
    membership: { findUnique: async () => ({ role }) },
    subscription: { findUnique: async () => ({ id: 'sub-row', organizationId: 'org-a', stripeCustomerId: 'cus_1' }) },
    auditLog: { create: async ({ data }) => { assert.equal(data.organizationId, 'org-a'); } }
  });
  let checkoutArgs;
  const billingProvider = () => ({ createCheckout: async args => { checkoutArgs = args; return { url: 'https://checkout.stripe.test/session' }; } });
  const event = { path: '/api/billing/checkout', httpMethod: 'POST', headers: { cookie: `qf_session=${sessionToken}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: JSON.stringify({ plan: 'PRO', organizationId: 'org-forged', amount: 1 }) };
  const denied = await createHandler({ readConfig: () => billingConfig, getPrisma: async () => makePrisma('VIEWER'), billingProvider })(event);
  assert.equal(denied.statusCode, 403);
  const accepted = await createHandler({ readConfig: () => billingConfig, getPrisma: async () => makePrisma('OWNER'), billingProvider })(event);
  assert.equal(accepted.statusCode, 200);
  assert.equal(checkoutArgs.organizationId, 'org-a');
  assert.equal(checkoutArgs.plan, 'PRO');
  assert.equal('amount' in checkoutArgs, false);
});

test('Stripe webhooks verify signatures, persist subscription state and ignore duplicate event IDs', async () => {
  const billingConfig = { ...config, stripe: { enabled: true, secretKey: 'sk_test', webhookSecret: 'whsec_test', prices: { PRO: 'price_pro', BUSINESS: 'price_business' } }, storage: { enabled: false }, pdf: {} };
  const stripeEvent = { id: 'evt_1', type: 'customer.subscription.updated', livemode: false, data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_start: 10, current_period_end: 20, metadata: { quoteflowOrganizationId: 'org-1' }, items: { data: [{ price: { id: 'price_pro', product: 'prod_1' } }] } } } };
  let storedSubscription, signatureCalls = 0;
  const tx = { stripeEvent: { create: async ({ data }) => { assert.equal(data.id, 'evt_1'); } }, subscription: { findUnique: async () => null, create: async ({ data }) => { storedSubscription = data; } }, auditLog: { create: async () => ({}) } };
  const prisma = { $transaction: async fn => fn(tx) };
  const provider = () => ({ constructEvent: async (payload, signature) => { signatureCalls++; assert.equal(payload, '{"event":true}'); assert.equal(signature, 'valid-signature'); return stripeEvent; }, retrieveSubscription: async id => { assert.equal(id, 'sub_1'); return stripeEvent.data.object; } });
  const handler = createHandler({ readConfig: () => billingConfig, getPrisma: async () => prisma, billingProvider: provider });
  const result = await handler({ path: '/api/stripe/webhook', httpMethod: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{"event":true}' });
  assert.equal(result.statusCode, 200);
  assert.equal(signatureCalls, 1);
  assert.equal(storedSubscription.organizationId, 'org-1');
  assert.equal(storedSubscription.plan, 'PRO');
  assert.equal(storedSubscription.status, 'ACTIVE');

  const duplicatePrisma = { $transaction: async () => { const error = new Error('duplicate'); error.code = 'P2002'; throw error; } };
  const duplicate = await createHandler({ readConfig: () => billingConfig, getPrisma: async () => duplicatePrisma, billingProvider: provider })({ path: '/api/stripe/webhook', httpMethod: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{"event":true}' });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(JSON.parse(duplicate.body).duplicate, true);
});

test('team mutations are tenant scoped and preserve organization ownership', async () => {
  const token = 'team-session', members = { owner: { userId: 'owner', organizationId: 'org-1', role: 'OWNER' }, rep: { userId: 'rep', organizationId: 'org-1', role: 'SALES_REP' } };
  let removed;
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'owner', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner', email: 'owner@example.test', passwordHash: 'salt:00' }, organization: { id: 'org-1', reportingCurrency: 'AED' } }), deleteMany: async ({ where }) => { removed = where; return { count: 1 }; } },
    membership: { findUnique: async ({ where }) => members[where.userId_organizationId.userId] || null, delete: async ({ where }) => { delete members[where.userId_organizationId.userId]; return {}; } },
    auditLog: { create: async () => ({}) },
    $transaction: async fn => fn(prisma)
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const call = userId => handler({ path: `/api/team/${userId}`, httpMethod: 'DELETE', headers: { cookie: `qf_session=${token}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: '{}' });
  assert.equal((await call('owner')).statusCode, 409);
  assert.equal((await call('outside-org')).statusCode, 404);
  assert.equal((await call('rep')).statusCode, 200);
  assert.equal(members.rep, undefined);
  assert.equal(removed.organizationId, 'org-1');
});

test('distributed authentication limits return 429 without revealing account existence', async () => {
  const scopes = [];
  const prisma = { user: { findUnique: async () => { throw new Error('identity lookup must not run after rate limit'); } } };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma, rateLimiter: () => ({ consume: async scope => { scopes.push(scope); return { allowed: false, retryAfter: 321 }; } }) });
  for (const [path, body] of [
    ['/api/auth/signup', { email: 'new@example.test', password: 'long-enough-password', organization: 'Example' }],
    ['/api/auth/login', { email: 'person@example.test', password: 'wrong-password-value' }],
    ['/api/auth/recovery', { email: 'person@example.test' }]
  ]) {
    const result = await handler({ path, httpMethod: 'POST', headers: { origin: config.appUrl, 'x-forwarded-for': '203.0.113.8' }, body: JSON.stringify(body) });
    assert.equal(result.statusCode, 429);
    assert.equal(result.headers['retry-after'], '321');
    assert.equal(JSON.parse(result.body).error.includes('account'), false);
  }
  assert.ok(scopes.includes('auth-signup'));
  assert.ok(scopes.includes('auth-login-ip'));
  assert.ok(scopes.includes('auth-recovery-ip'));
});

test('unverified users are blocked from commercial and sensitive operations', async () => {
  const token = 'unverified-session';
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'user-1', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'user-1', email: 'owner@example.test', emailVerifiedAt: null }, organization: { id: 'org-1', name: 'Example', reportingCurrency: 'AED' } }) },
    membership: { findUnique: async () => ({ role: 'OWNER' }) }
  };
  const handler = createHandler({ readConfig: () => ({ ...config, stripe: { enabled: true } }), getPrisma: async () => prisma });
  const headers = { cookie: `qf_session=${token}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl };
  for (const [path, body] of [['/api/billing/checkout', { plan: 'PRO' }], ['/api/team/invite', { email: 'rep@example.test', role: 'SALES_REP' }], ['/api/settings', { company: 'Example' }], ['/api/account/deletion-request', {}]]) {
    const result = await handler({ path, httpMethod: path === '/api/settings' ? 'PUT' : 'POST', headers, body: JSON.stringify(body) });
    assert.equal(result.statusCode, 403);
    assert.equal(JSON.parse(result.body).code, 'EMAIL_VERIFICATION_REQUIRED');
  }
});

test('verification resend rotates prior tokens and never exposes the bearer token', async () => {
  const token = 'resend-session'; let invalidated = false, created, delivered;
  const tx = {
    emailVerificationToken: {
      updateMany: async () => { invalidated = true; return { count: 1 }; },
      create: async ({ data }) => { created = data; return { id: 'verification-2', ...data }; }
    }
  };
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'user-1', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'user-1', email: 'owner@example.test', emailVerifiedAt: null }, organization: { id: 'org-1', name: 'Example', reportingCurrency: 'AED' } }) },
    membership: { findUnique: async () => ({ role: 'OWNER' }) },
    $transaction: async fn => fn(tx)
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma, emailProvider: () => ({ send: async message => { delivered = message; return { id: 'email-1' }; } }) });
  const result = await handler({ path: '/api/auth/resend-verification', httpMethod: 'POST', headers: { cookie: `qf_session=${token}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: '{}' });
  assert.equal(result.statusCode, 200);
  assert.equal(invalidated, true);
  assert.match(created.tokenHash, /^[a-f0-9]{64}$/);
  assert.match(delivered.text, /verify-email\?token=/);
  assert.equal(result.body.includes('token'), false);
});

test('ownership transfer requires the current owner password and an in-tenant target', async () => {
  const sessionToken = 'owner-session', password = 'correct-horse-battery-staple', salt = randomBytes(16);
  const passwordHash = `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
  const memberships = { owner: { userId: 'owner', organizationId: 'org-1', role: 'OWNER' }, manager: { userId: 'manager', organizationId: 'org-1', role: 'SALES_MANAGER' } };
  let audit;
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'owner', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner', email: 'owner@example.test', emailVerifiedAt: new Date(), passwordHash }, organization: { id: 'org-1', name: 'Example', reportingCurrency: 'AED' } }), deleteMany: async () => ({ count: 0 }) },
    membership: {
      findUnique: async ({ where }) => memberships[where.userId_organizationId.userId] || null,
      updateMany: async ({ where, data }) => { if (memberships.owner.role !== where.role) return { count: 0 }; memberships.owner.role = data.role; return { count: 1 }; },
      update: async ({ where, data }) => { const row = memberships[where.userId_organizationId.userId]; row.role = data.role; return row; }
    },
    auditLog: { create: async ({ data }) => { audit = data; return data; } },
    $transaction: async fn => fn(prisma)
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const call = body => handler({ path: '/api/team/transfer-ownership', httpMethod: 'POST', headers: { cookie: `qf_session=${sessionToken}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: JSON.stringify(body) });
  assert.equal((await call({ targetUserId: 'outside', currentPassword: password, confirm: 'TRANSFER' })).statusCode, 404);
  assert.equal((await call({ targetUserId: 'manager', currentPassword: 'wrong', confirm: 'TRANSFER' })).statusCode, 401);
  const result = await call({ targetUserId: 'manager', currentPassword: password, confirm: 'TRANSFER' });
  assert.equal(result.statusCode, 200);
  assert.equal(memberships.owner.role, 'ADMIN');
  assert.equal(memberships.manager.role, 'OWNER');
  assert.equal(audit.action, 'organization.ownership_transferred');
});

test('account deletion refuses a sole organization owner', async () => {
  const sessionToken = 'delete-session', password = 'correct-horse-battery-staple', salt = randomBytes(16);
  const passwordHash = `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'owner', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner', emailVerifiedAt: new Date(), passwordHash }, organization: { id: 'org-1', reportingCurrency: 'AED' } }) },
    membership: { findUnique: async () => ({ role: 'OWNER' }), findMany: async () => [{ organizationId: 'org-1', role: 'OWNER' }], count: async () => 0 }
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const result = await handler({ path: '/api/account', httpMethod: 'DELETE', headers: { cookie: `qf_session=${sessionToken}; qf_csrf=csrf`, 'x-csrf-token': 'csrf', origin: config.appUrl }, body: JSON.stringify({ currentPassword: password, confirm: 'DELETE MY ACCOUNT' }) });
  assert.equal(result.statusCode, 409);
  assert.match(JSON.parse(result.body).error, /Transfer ownership/);
});

test('customer maintenance is tenant-scoped and archival preserves historical data', async () => {
  const token = 'customer-edit-session', customer = { id: 'cust-1', organizationId: 'org-1', companyName: 'Old Name', email: 'old@example.test', deletedAt: null };
  let auditCount = 0;
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'owner', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner', emailVerifiedAt: new Date() }, organization: { id: 'org-1' } }) },
    membership: { findUnique: async () => ({ role: 'OWNER' }) },
    customer: {
      findFirst: async ({ where }) => where.organizationId === 'org-1' && where.id === customer.id && !customer.deletedAt ? customer : null,
      update: async ({ data }) => Object.assign(customer, data),
      updateMany: async ({ data }) => { Object.assign(customer, data); return { count: 1 }; }
    },
    auditLog: { create: async () => { auditCount++; return {}; } }
  };
  const handler = createHandler({ readConfig: () => config, getPrisma: async () => prisma });
  const call = (path, method, body = {}) => handler({ path: '/api' + path, httpMethod: method, headers: { origin: config.appUrl, cookie: 'qf_session=' + token + '; qf_csrf=csrf', 'x-csrf-token': 'csrf' }, body: JSON.stringify(body) });
  assert.equal((await call('/customers/not-ours', 'PATCH', { companyName: 'Tamper' })).statusCode, 404);
  assert.equal((await call('/customers/cust-1', 'PATCH', { email: 'not-an-email' })).statusCode, 400);
  const edited = await call('/customers/cust-1', 'PATCH', { companyName: 'Updated Trading', email: 'sales@example.test' });
  assert.equal(edited.statusCode, 200);
  assert.equal(customer.companyName, 'Updated Trading');
  assert.equal((await call('/customers/cust-1', 'DELETE')).statusCode, 200);
  assert.ok(customer.deletedAt instanceof Date);
  assert.equal((await call('/customers/cust-1', 'PATCH', { companyName: 'Nope' })).statusCode, 404);
  assert.equal(auditCount, 2);
});

test('customer bearer link tokens are redacted before request logging', () => {
  assert.equal(sanitizedRequestPath('/api/public/quote/secret-token/pdf'), '/api/public/quote/[redacted]/pdf');
  assert.equal(sanitizedRequestPath('/q/secret-token'), '/q/[redacted]');
  assert.equal(sanitizedRequestPath('/api/quotes/ordinary-id/pdf'), '/api/quotes/ordinary-id/pdf');
});

test('authenticated PDF downloads reuse archived private PDF rather than allocating copies', async () => {
  const token = 'pdf-session'; let archives = 0, renders = 0, uploads = 0, existing = null;
  const quote = { id: 'quote1', number: 'Q-1', organizationId: 'org-1', status: 'SENT', version: 2, snapshot: { version: 2, items: [], totals: {} }, items: [] };
  const prisma = {
    session: { findUnique: async () => ({ id: 'session-1', userId: 'owner', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner' }, organization: { id: 'org-1' } }) },
    membership: { findUnique: async () => ({ role: 'OWNER' }) },
    quote: { findFirst: async () => quote },
    attachment: {
      findFirst: async () => existing,
      findUnique: async () => existing,
      upsert: async ({ create }) => { archives++; existing = create; return create; }
    },
    auditLog: { create: async () => ({}) }
  };
  const handler = createHandler({
    readConfig: () => ({ ...config, storage: { enabled: true, provider: 's3' }, pdf: {} }),
    getPrisma: async () => prisma,
    pdfProvider: async () => { renders++; return Buffer.from('%PDF-test'); },
    storageProvider: () => ({
      put: async () => { uploads++; },
      get: async () => Buffer.from('%PDF-test')
    })
  });
  const event = { path: '/api/quotes/quote1/pdf', httpMethod: 'GET', headers: { cookie: 'qf_session=' + token } };
  assert.equal((await handler(event)).statusCode, 200);
  assert.equal((await handler(event)).statusCode, 200);
  assert.equal(archives, 1);
  assert.equal(uploads, 1);
  assert.equal(renders, 1);
});

test('late Stripe events cannot overwrite newer reconciled subscription state', async () => {
  const billingConfig = { ...config, stripe: { enabled: true, secretKey: 'sk_test', webhookSecret: 'whsec_test', prices: { PRO: 'price_pro' } } };
  const current = { id: 'sub-1', customer: 'cus-1', status: 'active', metadata: { quoteflowOrganizationId: 'org-1' }, items: { data: [{ price: { id: 'price_pro', product: 'prod-pro' } }] } };
  const events = [
    { id: 'evt-new', created: 200, livemode: false, type: 'customer.subscription.updated', data: { object: current } },
    { id: 'evt-old', created: 100, livemode: false, type: 'customer.subscription.deleted', data: { object: { ...current, status: 'canceled' } } }
  ];
  let stored = null, auditCount = 0, retrieved = 0;
  const tx = {
    stripeEvent: { create: async () => ({}) },
    subscription: {
      findUnique: async () => stored,
      create: async ({ data }) => { stored = data; return stored; },
      updateMany: async ({ data }) => { stored = { ...stored, ...data }; return { count: 1 }; }
    },
    auditLog: { create: async () => { auditCount++; } }
  };
  const handler = createHandler({
    readConfig: () => billingConfig,
    getPrisma: async () => ({ $transaction: async fn => fn(tx) }),
    billingProvider: () => ({
      constructEvent: async () => events.shift(),
      retrieveSubscription: async id => { assert.equal(id, 'sub-1'); retrieved++; return current; }
    })
  });
  const event = { path: '/api/stripe/webhook', httpMethod: 'POST', headers: { 'stripe-signature': 'signature' }, body: '{"event":1}' };
  assert.equal((await handler(event)).statusCode, 200);
  assert.equal(stored.status, 'ACTIVE');
  assert.equal((await handler(event)).statusCode, 200);
  assert.equal(stored.status, 'ACTIVE');
  assert.equal(stored.lastStripeEventAt.getTime(), 200000);
  assert.equal(auditCount, 1);
  assert.equal(retrieved, 2);
});
