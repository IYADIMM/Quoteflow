# Staging Qualification Gate

Do not classify QuoteFlow as `BETA_READY` until every critical item below passes in one isolated staging environment. Record the date, deploy ID, operator, provider account/mode, and evidence link without copying secrets.

## 1. Code and database

```powershell
pnpm install --frozen-lockfile
pnpm run db:validate
pnpm run db:generate
$env:DIRECT_URL = $env:STAGING_DATABASE_URL
pnpm run db:migrate
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
pnpm run db:qualify
pnpm run release:check
```

`db:qualify` refuses database names that do not contain `staging`, `stage`, `test`, `qualif`, or `drill`. It creates, reads, and removes a complete synthetic tenant containing a user, organization, membership, customer, catalog item, RFQ, quote snapshot, approval, event, subscription, attachment metadata, and audit record. Never point it at production.

- [ ] Migration completed without reset or drift.
- [ ] `DATABASE_QUALIFICATION_PASSED` recorded.
- [ ] `/api/health` returns 200 and `database: postgresql`.
- [ ] Netlify HTTPS and production configuration validation pass.

## 2. Authentication and security

- [ ] Signup, verification, resend, login, recovery, reset, and logout work.
- [ ] Unverified user cannot send, invite, manage billing/settings, or request deletion.
- [ ] Login, signup, recovery, reset, verification resend, invite, and public question limits return 429 with `Retry-After`.
- [ ] CSRF failure is rejected and tenant/role IDOR checks hold.
- [ ] Password change revokes other sessions; ownership transfer leaves exactly one Owner.

## 3. Commercial workflow and portal

- [ ] Create customer, catalog item, RFQ, mixed catalog/manual quote, approval, send, revision, and duplicate.
- [ ] Minimum price, margin, currency, expiry, and server total controls reject invalid input.
- [ ] PDF is multi-page when needed, has correct currency/totals, and exposes no cost or margin.
- [ ] Customer link records VIEWED without changing revision; question, accept, reject, revoke, rotate, and expiry work.
- [ ] A duplicate send key sends no second email; ambiguous delivery blocks automatic retry.

## 4. Providers

- [ ] Stripe test Checkout, webhook, entitlements, Portal, cancellation, payment failure, recovery, and replay pass. Follow `STRIPE_STAGING.md`.
- [ ] Resend verification, recovery, invite, quote, and question emails arrive at a controlled recipient. Record message IDs and test a provider rejection. Verify SPF, DKIM, DMARC, and bounce handling.
- [ ] Gemini extraction, follow-up, description, summary, invalid key, quota/error, malformed output, timeout, and disabled mode behave as documented.
- [ ] Private S3-compatible upload, completion check, download, delete, generated PDF, quota, invalid type, tenant isolation, and CORS pass. Bucket public access remains blocked.
- [ ] Upstash limits work across two function instances or consecutive cold starts; stored keys contain hashes only.
- [ ] Deliberate browser and API errors reach the configured monitoring webhook with request IDs and no request bodies or secrets.

## 5. Recovery and operations

- [ ] Create staging records, run `backup-postgres.ps1`, restore to an isolated database with `restore-drill.ps1`, point a staging instance at it, and verify users, organizations, memberships, customers, catalog, RFQs, quotes, approvals, snapshots, subscriptions, attachments, and audit logs.
- [ ] Alerts fire for health failure, DB unavailable, API 5xx, Stripe webhook failure, Resend failure, Gemini failure, storage failure, repeated login failure, and stale/failed backup.
- [ ] Organization deletion wording says operator processing; the operator runbook and retention decision are assigned.

## Result

Any unchecked critical item keeps the release at `STAGING_READY`. When all items pass, record the evidence and change `RELEASE_STATUS.md` to `BETA_READY`.
