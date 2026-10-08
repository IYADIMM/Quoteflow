# Support Runbook

## Intake

Collect organization name, user email, UTC time, affected quote/RFQ number, browser, visible error and response `x-request-id`. Never request passwords, session cookies, public bearer tokens or provider secrets.

## Triage

- Access/tenant: verify membership and active organization; do not move records manually between tenants.
- Pricing/approval: preserve the quote revision and snapshot; reproduce with the pricing tests before any data correction.
- Send: inspect send attempt state and provider logs. `AMBIGUOUS` requires human verification and must not be blindly retried.
- Customer link: validate expiry/revocation/rotation events; issue a new token only through the API.
- Billing: use Stripe customer/subscription/event IDs and webhook history. Browser redirect is not proof of payment.
- AI: confirm the manual workflow works; AI output is always a suggestion.
- Upload: check reservation/status/magic-byte rejection and private object key without exposing a signed URL in a ticket.

Escalate confirmed security, financial integrity, cross-tenant, acceptance or data-loss issues under `INCIDENT_RESPONSE.md`. Close with root cause, workaround/fix, verification and whether documentation/tests changed.
