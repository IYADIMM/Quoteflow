# Operations Handover

## Accounts the operator must control

- GitHub repository and protected release workflow.
- Netlify team/site and DNS/domain.
- Managed PostgreSQL account with pooling, backups, and PITR.
- Resend account and verified sending domain.
- Stripe sandbox and live account when commercial approval is granted.
- Google AI Studio or Google Cloud Gemini account.
- Private S3-compatible storage account.
- Upstash Redis account if distributed limiting is enabled.
- Monitoring/alert receiver and an incident communication channel.

## Routine operation

- Daily: check health, function 5xx, database connections/storage, failed Stripe webhooks, email bounces, provider errors, and backup freshness.
- Weekly: review rate-limit events, storage growth, quote-send ambiguous states, dependency updates, and support incidents.
- Before each release: run `RELEASE_CHECKLIST.md`, back up, migrate staging, qualify, run the full release gate and browser tests, then record the exact artifact.
- Quarterly: execute an isolated restore drill, review access, rotate eligible secrets, and test incident contacts.

## Buyer clean-install path

1. Install Node.js 22.13+ and pnpm 11.25.0.
2. Copy `.env.example` to `.env` and set new buyer-owned PostgreSQL URLs.
3. Run `pnpm install --frozen-lockfile`, `pnpm run db:validate`, `pnpm run db:generate`, and `pnpm run db:migrate`.
4. Run `pnpm run release:check`.
5. Configure Netlify from `netlify.toml` and set secrets in the dashboard.
6. Configure test-mode providers only as needed, then follow `STAGING_QUALIFICATION.md`.

No feature requires a personal developer path or hidden repository file. Live credentials and provider accounts are intentionally external. Manual RFQ entry and pasted-text extraction are implemented; automatic mailbox ingestion and attachment OCR are not.

## Cost assumptions

For up to 10 beta organizations, fewer than 1,000 quotes, 3,000 emails, 500,000 limit commands, 5 GB attachments, and low Gemini usage: evaluation USD 0–20/month, controlled paid beta USD 50–100/month, and stronger production operations USD 250+/month. Stripe transaction fees, domain, taxes, labor, legal/compliance, and independent security testing are excluded. Reprice using current provider calculators before purchase; see `OPERATING_COST_MODEL.md`.

## Support escalation

Use request IDs to correlate incidents. Never automatically retry an ambiguous quote email. Compare Stripe event history before editing subscription data. Follow `INCIDENT_RESPONSE.md`, `OPERATIONS.md`, and `BACKUP_RESTORE.md`.
