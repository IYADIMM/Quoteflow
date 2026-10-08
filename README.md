# QuoteFlow

QuoteFlow is a B2B request-for-quotation and quote workflow with a browser demo and a server-backed account mode. The account API runs as a Netlify Function and persists tenant data in PostgreSQL through Prisma.

## Local setup

Requires Node.js 22.13+ and PostgreSQL. Copy `.env.example` to `.env`, set `DATABASE_URL` and `DIRECT_URL`, then start PostgreSQL (for example, `docker compose up -d`). Install dependencies and run:

```sh
npm install
npm run dev
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
- Structured request logs with request IDs, PostgreSQL health checks, optional Upstash distributed limiting for public questions, owner data export, and a seven-day organization deletion cooling period.
- A responsive commercial workspace with an attention-driven dashboard, global keyboard search, live quote profitability, clear approval/send review, accessible forms, professional customer documents, and an isolated fictional demo.
- `.env.example`, local Postgres compose setup, build scripts, security headers, automated business-rule tests, and browser workflow checks.

## Configuration

Required for production: `DATABASE_URL` (pooled PostgreSQL URL), `DIRECT_URL` (direct/migration URL), and `APP_URL` (public HTTPS origin). Sessions use cryptographically random bearer tokens stored as SHA-256 hashes; no `SESSION_SECRET` is used or required. Optional provider configuration is documented in `.env.example`: Gemini, Resend, Stripe, S3-compatible storage, a PDF font, and Upstash rate limiting all fail closed when explicitly enabled but incomplete.

Netlify build runs `npm run build`; publish directory is `dist`; function directory is `netlify/functions`. Apply database migrations with `npm run db:migrate` during release operations. Do not publish the repository root.

## Verification and limits

Run `npm run release:check` for Prisma validation/generation, the complete automated suite, and the static build. Provider tests use mocked Gemini, Resend, Stripe, S3 and Upstash behavior. The demo is browser-local and fictional; account data is server-authoritative. On 8 October 2026, 42 automated tests, Prisma schema validation/client generation, the static build, and the previously established 51 browser workflow/responsive checks passed in this workspace. A live PostgreSQL migration attempt failed because no local PostgreSQL server or client tools were available. No Netlify deployment or live provider request was performed. See `PRODUCTION_SMOKE_TEST.md` for the credential-dependent staging checks.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [DEPLOYMENT.md](DEPLOYMENT.md).
