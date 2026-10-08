import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePlan, entitlementsFor, PLAN_ENTITLEMENTS } from '../lib/entitlements.mjs';

test('paid entitlements follow authoritative subscription status and grace period', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  assert.equal(effectivePlan({ plan: 'PRO', status: 'ACTIVE' }, now), 'PRO');
  assert.equal(effectivePlan({ plan: 'BUSINESS', status: 'TRIALING' }, now), 'BUSINESS');
  assert.equal(effectivePlan({ plan: 'PRO', status: 'PAST_DUE', currentPeriodEnd: new Date('2026-10-03T00:00:00Z') }, now), 'PRO');
  assert.equal(effectivePlan({ plan: 'PRO', status: 'PAST_DUE', currentPeriodEnd: new Date('2026-09-30T00:00:00Z') }, now), 'FREE');
  assert.equal(effectivePlan({ plan: 'PRO', status: 'PAST_DUE' }, now), 'FREE');
  assert.equal(effectivePlan({ plan: 'BUSINESS', status: 'PAST_DUE', currentPeriodEnd: 'invalid' }, now), 'FREE');
  for (const status of ['UNPAID', 'INCOMPLETE', 'CANCELED']) assert.equal(effectivePlan({ plan: 'BUSINESS', status }, now), 'FREE');
});

test('usage and availability are derived from centralized plan limits', () => {
  const result = entitlementsFor({ plan: 'PRO', status: 'ACTIVE' }, { teamMembers: 4, quotesThisMonth: 20, aiRequestsThisMonth: 40, storageBytes: 1024 });
  assert.equal(result.limits, PLAN_ENTITLEMENTS.PRO);
  assert.equal(result.available.teamMembers, 6);
  assert.equal(result.available.quotesThisMonth, 480);
  assert.equal(result.available.aiRequestsThisMonth, 460);
});
