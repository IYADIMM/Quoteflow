import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHandler, reserveAIUsage } from '../netlify/functions/api.mjs';

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
