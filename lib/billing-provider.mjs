import { createHash } from 'node:crypto';

export class StripeBillingProvider {
  constructor({ secretKey, webhookSecret, prices, appUrl, stripeFactory } = {}) { this.secretKey = secretKey; this.webhookSecret = webhookSecret; this.prices = prices || {}; this.appUrl = appUrl; this.stripeFactory = stripeFactory; this.clientPromise = null; }
  async client() {
    if (!this.secretKey) throw new Error('Stripe billing is not configured.');
    if (!this.clientPromise) this.clientPromise = (async () => { const Stripe = this.stripeFactory || (await import('stripe')).default; return new Stripe(this.secretKey, { apiVersion: '2025-08-27.basil', appInfo: { name: 'QuoteFlow', version: '1.0.0' } }); })();
    return this.clientPromise;
  }
  priceFor(plan) { const id = this.prices[String(plan || '').toUpperCase()]; if (!id) throw new Error('That subscription plan is unavailable.'); return id; }
  async createCustomer({ organizationId, name, email }) { return (await this.client()).customers.create({ name, email: email || undefined, metadata: { quoteflowOrganizationId: organizationId } }, { idempotencyKey: `qf_customer_${organizationId}` }); }
  async createCheckout({ organizationId, customerId, plan }) { const stripe = await this.client(); return stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: this.priceFor(plan), quantity: 1 }], success_url: `${this.appUrl}/workspace?billing=success`, cancel_url: `${this.appUrl}/workspace?billing=cancelled`, client_reference_id: organizationId, metadata: { quoteflowOrganizationId: organizationId, plan: plan.toUpperCase() }, subscription_data: { metadata: { quoteflowOrganizationId: organizationId, plan: plan.toUpperCase() } }, allow_promotion_codes: true }, { idempotencyKey: `qf_checkout_${organizationId}_${plan}_${Math.floor(Date.now() / 300000)}` }); }
  async createPortal({ customerId }) { return (await this.client()).billingPortal.sessions.create({ customer: customerId, return_url: `${this.appUrl}/workspace` }); }
  async constructEvent(payload, signature) { if (!this.webhookSecret) throw new Error('Stripe webhook verification is not configured.'); return (await this.client()).webhooks.constructEvent(payload, signature, this.webhookSecret); }
}

export const stripePayloadHash = payload => createHash('sha256').update(payload).digest('hex');
export const planFromPrice = (priceId, prices) => Object.entries(prices).find(([, id]) => id === priceId)?.[0] || 'FREE';
export function subscriptionRecord(subscription, prices) {
  const price = subscription.items?.data?.[0]?.price;
  return {
    stripeSubscriptionId: subscription.id, stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripePriceId: price?.id || null, stripeProductId: typeof price?.product === 'string' ? price.product : price?.product?.id || null,
    plan: planFromPrice(price?.id, prices), status: String(subscription.status || 'incomplete').toUpperCase(),
    currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null, lastStripeSyncAt: new Date()
  };
}
