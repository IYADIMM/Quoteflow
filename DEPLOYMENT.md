# Deployment

## Local development

Use Node.js 22.13+ and PostgreSQL. Copy `.env.example` to `.env`, configure local database URLs, then run `docker compose up -d`, `npm install`, and `npm run dev`. The dev script generates the client/build, applies migrations, and runs Netlify Dev on port 8888.

## Netlify

Set the build command to `npm run build`, publish directory to `dist`, and function directory to `netlify/functions` (also declared in `netlify.toml`). Configure `DATABASE_URL`, `DIRECT_URL`, and `APP_URL` (HTTPS). Configure optional providers from `.env.example`. Stripe needs two recurring Price IDs and a webhook endpoint at `/api/stripe/webhook`; object storage must be private; Upstash is optional but recommended for multi-instance public traffic. Store secrets in Netlify environment variables, never in source control.

Run `npm run release:check`, create a pre-migration backup, then run `npm run db:migrate` against the direct production database before switching traffic. The Prisma runtime uses the pooled `DATABASE_URL`; migrations use `DIRECT_URL`. Follow `BACKUP_RESTORE.md`, `STAGING.md`, and `PRODUCTION_SMOKE_TEST.md`.

## Current verification limits

Dependencies were installed and Prisma 7 validation/generation, 42 automated tests, the static build, and the previously established 51 browser checks passed on 8 October 2026. The environment had no `npm` command, so the equivalent `node scripts/release-check.mjs` was executed directly. `prisma migrate deploy` was attempted but the configured local PostgreSQL server was unavailable; no database was modified. Netlify, live Stripe/Gemini/Resend/S3/Upstash, DNS/TLS, backup restoration and production monitoring remain external verification steps.
