import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, UpstashRateLimiter } from '../lib/rate-limit.mjs';

test('distributed limiter hashes subjects and enforces the configured window', async () => {
  let request;
  const limiter = new UpstashRateLimiter({ url: 'https://redis.example.test/', token: 'private-token', fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => [{ result: 6 }, { result: 1 }] }; } });
  const result = await limiter.consume('public-question', 'quote-1:203.0.113.2', { limit: 5, windowSeconds: 600 });
  assert.equal(result.allowed, false);
  assert.equal(request.url, 'https://redis.example.test/pipeline');
  assert.equal(request.options.headers.authorization, 'Bearer private-token');
  assert.equal(request.options.body.includes('203.0.113.2'), false);
  assert.match(request.options.body, /quoteflow:public-question:[a-f0-9]{64}/);
  assert.match(request.options.body, /"EXPIRE"/);
});

test('distributed limiter is enabled only when explicitly configured', () => {
  assert.equal(createRateLimiter({ rateLimit: { provider: '' } }), null);
  assert.ok(createRateLimiter({ rateLimit: { provider: 'upstash', url: 'https://redis.test', token: 'token' } }) instanceof UpstashRateLimiter);
});
