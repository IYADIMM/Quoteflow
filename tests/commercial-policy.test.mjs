import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQuotePolicy } from '../lib/commercial-policy.mjs';

const evaluate = (marginMode, margin, rest = {}) => evaluateQuotePolicy({
  minimumMargin: 20, margin, marginMode, ...rest
});

test('WARNING permits below-guideline quotes without approval', () => {
  const result = evaluate('WARNING', 10);
  assert.equal(result.blockedReason, null);
  assert.equal(result.requiresApproval, false);
  assert.match(result.warning, /below/);
});

test('APPROVAL_REQUIRED blocks sending without approval for low margin', () => {
  const result = evaluate('APPROVAL_REQUIRED', 10);
  assert.equal(result.blockedReason, null);
  assert.equal(result.requiresApproval, true);
});

test('BLOCK rejects low-margin quotes even if an approval might exist', () => {
  const result = evaluate('BLOCK', 10);
  assert.match(result.blockedReason, /minimum margin/);
  assert.equal(result.requiresApproval, false);
});

test('catalog minimum price is never bypassed by WARNING or BLOCK', () => {
  for (const mode of ['WARNING', 'BLOCK']) {
    assert.match(evaluate(mode, 50, { belowMinimumPrice: true, allowMinimumOverride: true }).blockedReason, /catalog minimum/);
  }
  assert.match(evaluate('APPROVAL_REQUIRED', 50, { belowMinimumPrice: true }).blockedReason, /catalog minimum/);
  const result = evaluate('APPROVAL_REQUIRED', 50, { belowMinimumPrice: true, allowMinimumOverride: true });
  assert.equal(result.blockedReason, null);
  assert.equal(result.requiresApproval, true);
});

test('unrestricted margins above threshold do not require approval', () => {
  for (const mode of ['WARNING', 'BLOCK', 'APPROVAL_REQUIRED']) {
    assert.deepEqual(evaluate(mode, 30), { blockedReason: null, requiresApproval: false, warning: null });
  }
});
