import test from 'node:test';
import assert from 'node:assert/strict';
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
    user: { findUnique: async () => ({ ...savedUser, memberships: [{ organizationId: 'org-1' }] }) },
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
  assert.equal(savedSession.organizationId, 'org-1');
  const badLogin = await handler({ path: '/api/auth/login', httpMethod: 'POST', headers: { origin: config.appUrl }, body: JSON.stringify({ email: 'owner@example.test', password: 'wrong-password-value' }) });
  assert.equal(badLogin.statusCode, 401);
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
