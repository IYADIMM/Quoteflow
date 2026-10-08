import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor, WebhookMonitor } from '../lib/monitoring.mjs';

test('monitoring is optional and disabled without an explicit provider', () => {
  assert.equal(createMonitor({ monitoring: { provider: '' } }), null);
});

test('webhook monitoring redacts common credentials and sends bounded metadata only', async () => {
  let request;
  const monitor = new WebhookMonitor({ dsn: 'https://monitor.example.test/events', environment: 'test', fetchImpl: async (url, options) => { request = { url, options }; return { ok: true }; } });
  assert.equal(await monitor.capture({ event: 'api_failure', message: 'token=public-link password=hunter2', path: '/api/quotes', requestId: 'req-1', ignoredBusinessPayload: 'must not be sent' }), true);
  const payload = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://monitor.example.test/events');
  assert.equal(payload.environment, 'test');
  assert.equal(payload.message.includes('public-link'), false);
  assert.equal(payload.message.includes('hunter2'), false);
  assert.equal('ignoredBusinessPayload' in payload, false);
});
