export const PLAN_ENTITLEMENTS = Object.freeze({
  FREE: Object.freeze({ teamMembers: 2, quotesPerMonth: 25, aiRequestsPerMonth: 25, storageBytes: 100 * 1024 * 1024, advancedCommercialControls: false }),
  PRO: Object.freeze({ teamMembers: 10, quotesPerMonth: 500, aiRequestsPerMonth: 500, storageBytes: 5 * 1024 * 1024 * 1024, advancedCommercialControls: true }),
  BUSINESS: Object.freeze({ teamMembers: 50, quotesPerMonth: 5000, aiRequestsPerMonth: 5000, storageBytes: 25 * 1024 * 1024 * 1024, advancedCommercialControls: true })
});

const PAID_ACCESS = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);
export function effectivePlan(subscription, now = new Date()) {
  if (!subscription) return 'FREE';
  const status = String(subscription.status || '').toUpperCase();
  if (!PAID_ACCESS.has(status)) return 'FREE';
  if (status === 'PAST_DUE' && (!subscription.currentPeriodEnd || !Number.isFinite(new Date(subscription.currentPeriodEnd).getTime()) || new Date(subscription.currentPeriodEnd).getTime() + 7 * 864e5 < now.getTime())) return 'FREE';
  return PLAN_ENTITLEMENTS[subscription.plan] ? subscription.plan : 'FREE';
}

export function entitlementsFor(subscription, usage = {}, now = new Date()) {
  const plan = effectivePlan(subscription, now), limits = PLAN_ENTITLEMENTS[plan];
  const used = { teamMembers: Number(usage.teamMembers || 0), quotesThisMonth: Number(usage.quotesThisMonth || 0), aiRequestsThisMonth: Number(usage.aiRequestsThisMonth || 0), storageBytes: Number(usage.storageBytes || 0) };
  return { plan, status: subscription?.status || 'ACTIVE', gracePeriodDays: 7, limits, usage: used, available: { teamMembers: Math.max(0, limits.teamMembers - used.teamMembers), quotesThisMonth: Math.max(0, limits.quotesPerMonth - used.quotesThisMonth), aiRequestsThisMonth: Math.max(0, limits.aiRequestsPerMonth - used.aiRequestsThisMonth), storageBytes: Math.max(0, limits.storageBytes - used.storageBytes) } };
}
