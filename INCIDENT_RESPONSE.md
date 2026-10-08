# Incident Response

## Severity

- **SEV-1:** confirmed tenant data exposure, credential compromise, financial corruption, unauthorized quote acceptance, or complete production outage.
- **SEV-2:** provider outage affecting sends/billing/uploads, degraded database, or repeated incorrect permissions without confirmed exposure.
- **SEV-3:** isolated defect with a safe workaround.

## Response

1. Assign incident lead and timestamp the report.
2. Preserve Netlify, database, Stripe, Resend and storage logs; use request IDs.
3. Contain: disable affected provider/feature, revoke exposed keys/tokens, rotate public links, or maintenance-mode writes.
4. Protect evidence before cleanup. Do not delete webhook/audit records.
5. Determine affected organizations, quote revisions and time window.
6. Restore from verified backup only after identifying the failure mode.
7. Notify affected parties and regulators according to counsel-approved obligations.
8. Record root cause, corrective controls and follow-up owner.

## Specific playbooks

- **Stripe mismatch:** pause billing UI, replay verified events from Stripe, compare event IDs/subscription rows, and never infer payment from the browser redirect.
- **Ambiguous quote email:** keep attempt blocked, inspect provider logs, and have a human decide whether to rotate/send a new revision.
- **Public token exposure:** revoke or rotate the quote link and review quote events.
- **Storage exposure:** make bucket private, rotate storage credentials/signed URLs, enumerate accessed object keys and tenant owners.
- **Database compromise:** rotate database credentials, revoke sessions, restore into a new database if integrity is uncertain.
