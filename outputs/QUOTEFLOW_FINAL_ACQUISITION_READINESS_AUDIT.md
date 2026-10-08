# QuoteFlow buyer clean-install verification

**Date:** 8 October 2026  
**Release classification:** `STAGING_READY`  
**Overall result:** **BLOCKED for live beta or production until external staging verification is completed.** The source package itself passes clean dependency, schema, test, build and browser checks.

**Result count:** 8 PASS, 0 FAIL, 5 BLOCKED. An initial pnpm attempt was prevented by the restricted Windows verification sandbox from creating its normal store symlink; the identical documented command completed after granting that ordinary filesystem permission.

## Verification results

| Area | Result | Evidence |
|---|---|---|
| Source-only package | PASS | A fresh copy excluded `.git`, `.env`, `node_modules`, `generated`, `dist`, outputs and local work files. |
| Locked dependency install | PASS | `pnpm install --frozen-lockfile` completed with pnpm 11.25.0 and 1,068 packages. The package declares its pnpm version and explicit dependency build policy. |
| Prisma schema/client | PASS | Prisma 7.10.0 validated the schema and generated the client from the clean copy. |
| Automated business rules | PASS | `pnpm run release:check`: 50 passed, 0 failed, followed by `RELEASE_CHECK_PASSED`. |
| Static/Netlify artifact | PASS | `pnpm run build` produced `dist/index.html`, `app.js`, `styles.css` and the supplied logo under `dist/assets/`. |
| Production dependency audit | PASS | `pnpm audit --prod --audit-level=high`: no known vulnerabilities. |
| Browser workflow | PASS | 52 checks passed, including demo RFQ/quote/send/public question/acceptance, mixed lines, responsive pages, account API isolation and the rendered product logo. |
| New PostgreSQL database and migrations | BLOCKED | `pnpm run db:migrate` reached the configured PostgreSQL datasource but no PostgreSQL server, Docker engine or `psql` client exists in this environment. No database was changed. |
| Database qualification and fresh organization | BLOCKED | The qualification script failed closed because no isolated `STAGING_DATABASE_URL` was supplied. A real signup/organization and server-backed RFQ-to-quotation run therefore could not be honestly verified here. |
| Netlify deployment | BLOCKED | The build succeeds, but Netlify CLI requires a buyer-owned linked site/project. No Netlify account or site credentials were available. |
| Test-mode provider smoke tests | BLOCKED | Gemini, Resend, Stripe, S3-compatible storage, Upstash and monitoring have code paths and mocked tests; no buyer-owned test credentials were supplied. |
| Backup/restore drill | BLOCKED | PostgreSQL client tools and an isolated restore database are unavailable. |
| Remaining executable failure | PASS | No unresolved package, schema, automated test, static build, browser or production dependency-audit failure remains. |

## Defects found and corrected

1. The repository committed a pnpm lockfile but buyer docs and the Netlify build command used npm. All active install, build, migration, deployment and release paths now use pnpm 11.25.0 and the frozen lockfile.
2. The pnpm workspace contained generated placeholder build-policy values, causing a clean install to exit unsuccessfully. It now explicitly allows the required package install scripts and rejects the unused native `unix-dgram` build.
3. Netlify CI used a different pnpm major version. CI and `packageManager` now pin pnpm 11.25.0.
4. The supplied QuoteFlow logo is now a built product asset, favicon and application brand. A browser assertion verifies it loads; CSS crops its large transparent canvas without altering the source artwork.
5. Buyer-facing descriptions now state the actual RFQ and attachment behavior.

## Buyer-facing feature claim audit

| Claim | Actual implementation |
|---|---|
| RFQ capture | **Manual.** A seller enters an RFQ or pastes RFQ text. There is no automatic mailbox/email ingestion. |
| AI RFQ extraction | **Implemented in code and mocked tests.** It is an explicit user action over supplied text, uses Gemini structured output and requires review. Live Gemini inference is unverified. |
| Attachments | **Upload lifecycle implemented.** Files can be validated and stored in private S3-compatible storage when configured. Automatic OCR/document extraction and malware scanning are not implemented. |
| Quote workflow | **Implemented and automatically tested.** Server pricing authority, catalog/manual lines, currency rules, approvals, revisions, send attempts, public links and responses are covered. A real PostgreSQL/Resend end-to-end staging run is still blocked. |
| Provider integrations | **Code-ready, not live-verified.** Stripe, Resend, Gemini, S3, Upstash and monitoring tests use mocks. |
| Demo | **Browser-local and fictional.** It never proves account persistence or provider delivery. |
| Production readiness | **Not established.** Current status remains `STAGING_READY`. |

## Undocumented dependency audit

- No developer-machine absolute path is present in the delivered application source or active documentation.
- The original OneDrive logo path is not referenced; the image is copied into `assets/quoteflow-logo.png` and built from there.
- `.env` is ignored and absent from the clean copy. `.env.example` lists the configuration surface.
- The only credential-like strings found were documented placeholders and test fixtures. No production secret was identified.
- Account records are server authoritative. `localStorage` is limited to the isolated fictional demo and removal of an obsolete authenticated cache key.
- No `/api/demo`, production `mailto:` question fallback, SQLite backend, or second application was found.

## Accounts the buyer must create

### Required for the core hosted product

1. **Netlify** account and site for static hosting and Functions.
2. **Managed PostgreSQL** account with pooled and direct connection URLs, plus a separate isolated staging database.
3. **Resend** account and verified sending domain for verification, recovery, invitations, quote delivery and seller notifications.
4. **Google AI Studio or Google Cloud** project with Gemini API access for advertised AI features.
5. **Domain registrar/DNS** account for the production domain, Netlify DNS/TLS records and Resend SPF/DKIM/DMARC.

### Required only when those features are enabled

6. **Stripe** account with test/live modes, two recurring Price IDs and webhook endpoint for paid plan billing.
7. **Private S3-compatible storage** account/bucket, such as AWS S3, Cloudflare R2 or Backblaze B2, for RFQ attachments and archived generated PDFs.
8. **Upstash Redis** account/database for distributed production rate limiting across function instances.
9. **Monitoring webhook provider** and incident recipients for server error alerts.

No personal developer account or credential is embedded in the source.

## Operating-cost assumptions

For a controlled beta of up to 10 organizations, under 1,000 quotes, 3,000 emails, 500,000 limiter commands and 5 GB of attachments per month:

- Evaluation with eligible free tiers: approximately **USD 0–20/month**, excluding a domain and labor.
- Controlled paid beta: approximately **USD 50–100/month**. This assumes Netlify Pro at USD 20, low-use managed PostgreSQL at about USD 8–25, Resend Pro at USD 20, and USD 0–35 combined for Gemini, storage, rate limiting and monitoring.
- Stronger HA/SLA, recovery and support: budget **USD 250+/month** before labor.
- Stripe processing is separate. The public UAE standard domestic-card price was **2.9% + AED 1.00** per successful transaction on the verification date; international-card and currency-conversion fees may apply.

These are planning figures, not quotes. See `OPERATING_COST_MODEL.md` for assumptions and official provider links.

## Buyer completion gate

The buyer can treat the package checks as repeatable, but must complete `STAGING_QUALIFICATION.md` with buyer-owned accounts. Release can move beyond `STAGING_READY` only after migrations, database qualification, fresh signup/organization, real RFQ-to-quotation/customer response, provider failure paths, backup/restore and monitoring alerts all pass in the same isolated staging environment.
