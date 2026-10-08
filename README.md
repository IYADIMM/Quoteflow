# QuoteFlow

QuoteFlow is a B2B request-for-quotation and quote workflow with a browser demo and a server-backed account mode. The account API runs as a Netlify Function and persists tenant data in PostgreSQL through Prisma.

## Local setup

Requires Node.js 22.13+, pnpm 11.25.0, and PostgreSQL. Install pnpm using its official installer (or `npm install --global pnpm@11.25.0` when npm is available). Copy `.env.example` to `.env`, set `DATABASE_URL` and `DIRECT_URL`, then start PostgreSQL (for example, `docker compose up -d`). Install the locked dependencies and run:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

The command builds the static site, deploys Prisma migrations, and starts Netlify Dev at `http://localhost:8888`. The browser demo uses fictional records in local browser storage. Account mode uses PostgreSQL; it does not use demo records. `.env` is ignored by Git.

## Implemented

- Netlify modern function handler and static build that publishes only `dist/`.
- PostgreSQL Prisma models and incremental migrations for tenants, users, sessions, customers, catalog, RFQs, quotes, follow-ups, AI usage, recovery/verification tokens and team invitations.
- Organization-bound sessions, salted scrypt passwords, HttpOnly cookies, CSRF double-submit token/origin checks, same-tenant membership resolution, role checks, audit events, password recovery, and email verification paths.
- Multi-organization membership support with a session-bound active organization, visible workspace switcher, server-side membership validation on every switch, and role re-derivation for the selected organization.
- Tenant-scoped customer/catalog/RFQ/quote/follow-up/settings/bootstrap/team/analytics APIs.
- Server-owned quote cost/tax from catalog items, manual and catalog quote lines, single-currency validation, fixed-point pricing, minimum-price and margin rules, explicit financial approvals, draft edits, immutable sent revisions, idempotent send attempts and customer outcomes bound to send-time snapshots.
- Customer public links store token hashes, support rotation/revocation/expiry, and expose customer-safe revisions. Questions are retained as quote activity before optional seller email notification; expired quotes cannot receive responses.
- Team invitations with hashed single-use tokens, seven-day expiry, invited-email match, role restrictions, and email delivery.
- Gemini integration through `@google/genai`, explicit AI extraction, follow-up copy, descriptions and summaries; outputs are schema-validated and remain suggestions for a human to review. AI usage is reserved against per-IP, per-tenant and plan quotas.
- Resend email adapter for verification, recovery, invitations and quote delivery.
- Organization billing through Stripe-hosted Checkout and Customer Portal, verified/idempotent webhooks, centralized Free/Pro/Business entitlements, quotas, and a documented seven-day past-due grace policy.
- Server-generated multi-page quotation PDFs built only from immutable customer snapshots, plus optional private S3-compatible storage for generated documents and validated RFQ attachments.
- Structured request logs with request IDs, PostgreSQL health checks, optional webhook error monitoring, optional Upstash distributed limiting for authentication/invitations/public questions, owner data export, and an operator-assisted seven-day organization deletion cooling period.
- Verified-email enforcement for commercial/sensitive actions, rate-limited verification resend, password/session controls, audited ownership transfer, and self-service user deletion that blocks sole organization Owners.
- A responsive commercial workspace with an attention-driven dashboard, global keyboard search, live quote profitability, clear approval/send review, accessible forms, professional customer documents, and an isolated fictional demo.
- `.env.example`, local Postgres compose setup, build scripts, security headers, automated business-rule tests, and browser workflow checks.

## Configuration

Required for production: `DATABASE_URL` (pooled PostgreSQL URL), `DIRECT_URL` (direct/migration URL), and `APP_URL` (public HTTPS origin). Sessions use cryptographically random bearer tokens stored as SHA-256 hashes; no `SESSION_SECRET` is used or required. Optional provider configuration is documented in `.env.example`: Gemini, Resend, Stripe, S3-compatible storage, a PDF font, Upstash rate limiting, and webhook monitoring fail safely when disabled and validate required settings when enabled.

Netlify build runs `pnpm run build`; publish directory is `dist`; function directory is `netlify/functions`. Apply database migrations with `pnpm run db:migrate` during release operations. Do not publish the repository root.

## Verification and limits

Run `pnpm run release:check` for Prisma validation/generation, the complete automated suite, and the static build. Provider tests use mocked Gemini, Resend, Stripe, S3, Upstash, and monitoring behavior. RFQs are entered manually or created from user-supplied text; there is no automatic mailbox ingestion. RFQ attachments are securely uploaded but are not automatically OCRed or extracted. The demo is browser-local and fictional; account data is server-authoritative. On 8 October 2026, a clean source-only install passed 50 automated tests, Prisma schema validation/client generation, the static build, and 52 browser workflow/responsive checks. A live PostgreSQL migration attempt failed because no local PostgreSQL server or client tools were available. No Netlify deployment or live provider request was performed. Current classification is `STAGING_READY`; see `RELEASE_STATUS.md` and `STAGING_QUALIFICATION.md`.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [DEPLOYMENT.md](DEPLOYMENT.md).
