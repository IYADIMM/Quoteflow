import test from 'node:test';
import assert from 'node:assert/strict';
import { ResendEmailProvider, createEmailProvider } from '../lib/email-provider.mjs';

test('Resend adapter sends validated transactional email using server credentials', async () => {
  let request;
  const provider = new ResendEmailProvider({ apiKey: 'server-only-key', from: 'QuoteFlow <quotes@example.test>', fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ id: 'email-1' }) }; } });
  assert.deepEqual(await provider.send({ to: 'buyer@example.test', subject: 'Quote ready', text: 'Review the quote.' }), { id: 'email-1' });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.authorization, 'Bearer server-only-key');
  assert.deepEqual(JSON.parse(request.options.body).to, ['buyer@example.test']);
  await assert.rejects(() => provider.send({ to: 'bad-email', subject: '', text: '' }), /invalid/);
});

test('email provider is explicitly disabled unless configured', () => {
  assert.equal(createEmailProvider({ email: { provider: '', apiKey: '', from: '' } }), null);
  assert.throws(() => createEmailProvider({ email: { provider: 'unknown', apiKey: '', from: '' } }), /Unsupported EMAIL_PROVIDER/);
});
