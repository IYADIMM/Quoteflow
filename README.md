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
- Tenant-scoped customer/catalog/RFQ/quote/follow-up/settings/bootstrap/team/analytics APIs.
- Server-owned quote cost/tax from catalog items, fixed-point pricing, minimum-price and margin rules, quote numbering, draft version checks, send-state transitions and customer public-link outcomes based on snapshot data.
- Team invitations with hashed single-use tokens, seven-day expiry, invited-email match, role restrictions, and email delivery.
- Gemini integration through `@google/genai`, explicit AI extraction, follow-up copy, descriptions and summaries; outputs are schema-validated and remain suggestions for a human to review. AI usage is reserved against per-IP, per-tenant and plan quotas.
- Resend email adapter for verification, recovery, invitations and quote delivery.
- `.env.example`, local Postgres compose setup, build scripts, security headers, and unit/handler/provider tests.

## Configuration

Required for production: `DATABASE_URL` (pooled PostgreSQL URL), `DIRECT_URL` (direct/migration URL), `APP_URL` (public HTTPS origin), and a strong `SESSION_SECRET`. Configure `AI_ENABLED=true` and `GEMINI_API_KEY` to enable Gemini. Set `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, and `EMAIL_FROM` for email delivery. Stripe keys are reserved configuration only; billing is not implemented.

Netlify build runs `npm run build`; publish directory is `dist`; function directory is `netlify/functions`. Apply database migrations with `npm run db:migrate` during release operations. Do not publish the repository root.

## Verification and limits

Run `npm test` for the automated suite. Provider tests use mocked Gemini/Resend responses. The workspace has no installed project dependencies, so Prisma generation, `npm run build`, live PostgreSQL migrations, Netlify local runtime, real Gemini calls, and real email delivery require dependency installation and the relevant environment/credentials. No production deployment or security certification has been performed. Stripe billing, server-side PDF generation, file storage/uploads, and notification delivery for customer questions remain unimplemented.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [DEPLOYMENT.md](DEPLOYMENT.md).
