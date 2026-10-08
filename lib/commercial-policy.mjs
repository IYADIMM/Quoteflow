/**
 * Authoritative margin/minimum-price policy for BOTH draft saves and sends.
 * Catalog minimum overrides are only offered to Sales Reps under explicit
 * approval-required mode; an approved draft can subsequently be sent by a
 * permitted manager without silently widening that creation rule.
 */
export function evaluateQuotePolicy({ margin, minimumMargin, marginMode = 'WARNING', belowMinimumPrice = false, allowMinimumOverride = false }) {
  const mode = String(marginMode).toUpperCase();
  if (!['WARNING', 'APPROVAL_REQUIRED', 'BLOCK'].includes(mode)) throw new Error('Invalid margin policy configuration.');
  if (!Number.isFinite(margin) || !Number.isFinite(minimumMargin)) throw new Error('Invalid margin policy values.');
  const lowMargin = margin < minimumMargin;
  const blockedReason = belowMinimumPrice && !(allowMinimumOverride && mode === 'APPROVAL_REQUIRED')
    ? 'Selling price cannot be below the catalog minimum.'
    : lowMargin && mode === 'BLOCK' ? 'Quote is below the configured minimum margin.' : null;
  return {
    blockedReason,
    requiresApproval: !blockedReason && mode === 'APPROVAL_REQUIRED' && (lowMargin || belowMinimumPrice),
    warning: !blockedReason && mode === 'WARNING' && lowMargin ? 'Quote is below the configured margin guideline.' : null
  };
}
