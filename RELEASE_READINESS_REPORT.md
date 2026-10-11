# QuoteFlow release-readiness verification

Verified on 11 October 2026 against branch `codex/release-candidate-20261011`, based on `origin/main` commit `cd3f71ab143e9083e8a68b774f5cbc611584b305` plus the preserved workspace changes.

## Result

**STAGING_READY. Not a verified release candidate yet.** The source gate passes, but the deployed staging API has no working PostgreSQL connection and the revised signup workflow has not been exercised against a live database.

| Area | Status | Evidence | Required action |
| --- | --- | --- | --- |
| Repository state | PASS | `origin/main` and the starting local `main` both resolved to `cd3f71a`; work moved to a dedicated branch without discarding local changes. | Push the branch and require pull-request CI before review. |
| Release gate | PASS | `pnpm run release:check` completed Prisma validation, Prisma client generation, 66/66 automated tests, and the static build; GitHub PR #2 `validate` passed after the final implementation push. | Repeat before any approved production deployment. |
| Production dependency audit | PASS | `pnpm audit --prod --audit-level high` reported no known vulnerabilities. | Keep the lockfile and rerun before promotion. |
| October 8 fixes | PASS (source and mocked tests) | Discount allocation, margin policy, customer maintenance, PDF archival, Stripe event ordering, bearer-link log redaction, and serializable quota reservations remain present and their regression tests pass. | Exercise provider and concurrency paths in isolated staging. |
| Authentication and sessions | PASS (automated) | Signup/login hashing and cookies, CSRF rejection, email-verification gates, recovery controls, session revocation, organization switching, and ownership transfer tests pass. | Live-test verification, recovery, and browser cookies through the staging HTTPS origin. |
| Roles and tenant isolation | PASS (application layer) | Authenticated object queries scope records to the session organization; organization switching revalidates membership and role. IDOR and role tests pass. | Run a two-tenant live staging test. Keep database credentials server-only. |
| Database-level isolation | NOT TESTED | QuoteFlow uses application-enforced tenancy; no database row-level-security policy is claimed. | If Supabase exposes `public` through its Data API, restrict schema/table grants or add reviewed RLS policies before loading customer data. |
| Prisma schema and migration files | PASS (static) | `prisma validate` and `prisma generate` pass; 13 ordered PostgreSQL migrations are present. | Apply them to a fresh isolated staging database and run `pnpm run db:qualify`. |
| Live PostgreSQL migration | BLOCKED | The configured development URLs target a local PostgreSQL instance that is unavailable; `prisma migrate deploy` failed before applying migrations. The qualification command also requires an explicit isolated staging URL. | Supply `STAGING_DATABASE_URL` and `DIRECT_URL` for a disposable database whose name contains `staging`, `stage`, `test`, `qualif`, or `drill`. |
| Pricing, discounts, currency, and approvals | PASS (automated) | Fixed-point discount reconciliation, catalog/manual lines, cross-currency rejection, minimum price, margin modes, approval rules, immutable snapshots, expiry, and send idempotency tests pass. | Complete the documented live RFQ-to-quote staging workflow. |
| PDF generation and data protection | PASS (automated) | Multi-page PDF generation passes; customer PDF model excludes cost, margin, minimum price, profit, and approval data. Canonical private archive reuse test passes. | Verify a generated PDF in staging with private storage enabled. |
| Subscriptions and Stripe webhooks | PASS (mocked); live NOT TESTED | Signature delegation, Checkout metadata, idempotency, authoritative reconciliation, event ordering, grace policy, and stale-event rejection tests pass. | Configure Stripe test keys/prices/webhook and run `STRIPE_STAGING.md`. |
| Rate limits | PASS (automated); distributed NOT TESTED | Local and mocked distributed throttling tests pass, including hashed subjects and 429 behavior. | Configure Upstash and test across cold starts or two function instances. |
| Netlify configuration | PASS (static) | `netlify.toml` publishes `dist`, bundles `netlify/functions`, defines SPA/public-quote rewrites, and sends security headers. | Use a Git-connected deploy preview for this branch. |
| Current Netlify staging runtime | FAIL | Published deploy `6ac74e589b9d3a08b85ef9bc` is ready, but `https://quoteflow-staging.netlify.app/api/health` returned HTTP 503 with `{"ok":false,"database":"unavailable"}`. It is an October 8 drop deploy with no commit reference. | Configure a reachable PostgreSQL URL, apply migrations, redeploy this branch, then repeat health and browser checks. |
| Revised signup and onboarding browser flow | NOT TESTED | Source and syntax are covered by the build; no current browser run exists after removal of the local demo and introduction of two-step business onboarding. | Test signup → business profile → catalog item → customer → RFQ → quote in staging. |
| Gemini | PASS (mocked); live NOT TESTED | Structured output, validation, catalog allow-list, bounded outputs, quota/error behavior, and disabled mode tests pass. No local key is configured. | Configure a staging Gemini key and run valid, malformed, timeout, quota, and invalid-key cases. |
| Resend | PASS (mocked); live NOT TESTED | Transactional adapter and question-retention-on-email-failure tests pass. No local key is configured. | Configure a verified staging sender and test verification, recovery, invite, quote, and question messages plus a rejection. |
| Private object storage | PASS (mocked); live NOT TESTED | Upload validation, magic-byte checks, tenant-scoped keys, reservation release, and persisted-key completion tests pass. No local credentials are configured. | Configure a private staging bucket and test upload, download, delete, CORS, isolation, and blocked public access. |
| Monitoring | PASS (mocked); live NOT TESTED | Redaction and bounded webhook payload tests pass. No endpoint is configured. | Configure a staging endpoint and verify deliberate client/API/provider errors arrive without bodies or secrets. |
| Backup and restore | BLOCKED | No reachable staging database is available. | Run the documented backup and isolated restore drill after staging PostgreSQL is healthy. |
| Supabase connection | BLOCKED | The connected Supabase integration returned no projects. | Create or connect the intended staging project, then inspect migrations, grants/RLS, advisors, backups, and connection pooling. |

## Defects fixed during verification

- Updated the signup integration regression to verify the full persisted business profile, organization reporting currency, commercial margin, and quote-validity defaults. The prior assertion expected the pre-onboarding settings shape and caused the release gate to fail.
- Removed remaining executable browser-demo paths and demo catalog import UI from the current workspace flow.
- Made the catalog currency selector use every supported onboarding currency, including KWD, BHD, OMR, QAR, CAD, AUD, and INR.
- Corrected buyer-facing documentation that treated historical demo browser checks as current release evidence.

## Required secrets and external accounts

Required for staging: a managed PostgreSQL account/database and a Netlify site with `DATABASE_URL`, `DIRECT_URL`, and HTTPS `APP_URL`.

Optional features require their corresponding accounts and secrets: Google AI Studio or Google Cloud for Gemini; Resend plus a verified sending domain; Stripe test mode with Pro/Business recurring prices and a webhook secret; an S3-compatible private bucket; Upstash Redis; and an HTTPS monitoring webhook receiver. Secret values were neither printed nor copied into this report.

## Release decision

Do not promote. The next qualifying milestone is a green Git-connected deploy preview backed by an isolated migrated PostgreSQL staging database, followed by the complete `STAGING_QUALIFICATION.md` workflow and provider smoke tests.
