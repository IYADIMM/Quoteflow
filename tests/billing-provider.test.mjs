import test from 'node:test';
import assert from 'node:assert/strict';
import { StripeBillingProvider, planFromPrice, stripePayloadHash, subscriptionRecord } from '../lib/billing-provider.mjs';

test('Stripe Checkout uses configured price IDs and organization metadata', async () => {
  const calls = [];
  class StripeMock {
    constructor(key) {
      assert.equal(key, 'sk_test_example');
      this.checkout = { sessions: { create: async (...args) => { calls.push(args); return { id: 'cs_1', url: 'https://checkout.stripe.test/session' }; } } };
      this.customers = { create: async () => ({ id: 'cus_1' }) };
      this.billingPortal = { sessions: { create: async () => ({ url: 'https://billing.stripe.test/session' }) } };
      this.webhooks = { constructEvent: (payload, signature, secret) => ({ payload, signature, secret }) };
    }
  }
  const provider = new StripeBillingProvider({ secretKey: 'sk_test_example', webhookSecret: 'whsec_example', prices: { PRO: 'price_pro' }, appUrl: 'https://quotes.example.com', stripeFactory: StripeMock });
  const session = await provider.createCheckout({ organizationId: 'org_1', customerId: 'cus_1', plan: 'PRO' });
  assert.equal(session.url, 'https://checkout.stripe.test/session');
  assert.equal(calls[0][0].line_items[0].price, 'price_pro');
  assert.equal(calls[0][0].line_items[0].quantity, 1);
  assert.equal(calls[0][0].metadata.quoteflowOrganizationId, 'org_1');
  assert.equal(calls[0][0].subscription_data.metadata.plan, 'PRO');
  assert.match(calls[0][1].idempotencyKey, /^qf_checkout_org_1_PRO_/);
  await assert.rejects(() => provider.createCheckout({ organizationId: 'org_1', customerId: 'cus_1', plan: 'ENTERPRISE' }), /unavailable/);
});

test('Stripe event verification is delegated and subscription records are normalized', async () => {
  class StripeMock { constructor() { this.webhooks = { constructEvent: (payload, signature, secret) => ({ payload, signature, secret }) }; } }
  const provider = new StripeBillingProvider({ secretKey: 'sk_test', webhookSecret: 'whsec_test', stripeFactory: StripeMock });
  assert.deepEqual(await provider.constructEvent('{}', 'sig'), { payload: '{}', signature: 'sig', secret: 'whsec_test' });
  const record = subscriptionRecord({ id: 'sub_1', customer: 'cus_1', status: 'canceled', current_period_start: 10, current_period_end: 20, cancel_at_period_end: true, canceled_at: 21, items: { data: [{ price: { id: 'price_business', product: 'prod_1' } }] } }, { BUSINESS: 'price_business' });
  assert.equal(record.plan, 'BUSINESS');
  assert.equal(record.status, 'CANCELED');
  assert.equal(record.stripeCustomerId, 'cus_1');
  assert.equal(record.cancelAtPeriodEnd, true);
  assert.equal(planFromPrice('unknown', { PRO: 'price_pro' }), 'FREE');
  assert.equal(stripePayloadHash('same'), stripePayloadHash('same'));
});
