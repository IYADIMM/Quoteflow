# Operations Runbook

## Daily checks

- `/api/health` returns 200 and `database: postgresql`.
- Netlify function error rate, p95 duration and 5xx volume remain within the current baseline.
- Stripe webhook deliveries have no unresolved failures.
- Resend suppression/bounce rate and quote-send errors are reviewed.
- Database storage, connection count, backup freshness and S3/R2 object growth are within plan limits.

Every API response carries `x-request-id`; function completion logs are JSON with method, path, status and duration. Use the request ID to correlate user reports. Logs deliberately omit bearer tokens, passwords and provider keys.

## Alerts

Create alerts for: health failure for five minutes, 5xx rate over 2%, repeated database connection errors, Stripe webhook retry/failure, email provider failure, storage verification failure, backup age over 26 hours, and unusual public-question throttling.

## Provider failure behavior

- Gemini: manual RFQ and quote workflows continue.
- Resend: quote sends remain unsent/failed or ambiguous; questions remain stored; invitations are removed when delivery fails.
- Stripe: existing database entitlements continue until webhook state changes. Reconcile missed events in Stripe before manual database action.
- Storage: attachments/PDF archival fail explicitly; quote PDF download still works when generation succeeds and storage is disabled.
- Upstash: the database question limit remains as fallback and an error is logged.

## Incident handling

See `INCIDENT_RESPONSE.md`. Never retry an ambiguous quotation email automatically. Never edit subscription state before comparing the Stripe customer/subscription and webhook history. Take a backup before emergency schema work.

## Routine release

Follow `RELEASE_CHECKLIST.md`, deploy to staging, execute `PRODUCTION_SMOKE_TEST.md`, back up production, apply migrations with `DIRECT_URL`, deploy the exact tested build, smoke health/auth/quote paths, and keep the prior Netlify deploy available for rollback.
