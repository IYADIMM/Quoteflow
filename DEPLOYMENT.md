# Deployment

## Local development

Use Node.js 22.13+, pnpm 11.25.0, and PostgreSQL. Copy `.env.example` to `.env`, configure local database URLs, then run `docker compose up -d`, `pnpm install --frozen-lockfile`, and `pnpm run dev`. The dev script generates the client/build, applies migrations, and runs Netlify Dev on port 8888.

## Netlify

Set the build command to `pnpm run build`, publish directory to `dist`, and function directory to `netlify/functions` (also declared in `netlify.toml`). Configure `DATABASE_URL`, `DIRECT_URL`, and `APP_URL` (HTTPS). Configure optional providers from `.env.example`. Stripe needs two recurring Price IDs and a webhook endpoint at `/api/stripe/webhook`; object storage must be private; Upstash is optional but recommended for multi-instance public traffic. Store secrets in Netlify environment variables, never in source control.

Run `pnpm run release:check`, create a pre-migration backup, then run `pnpm run db:migrate` against the direct staging database and `pnpm run db:qualify` against the isolated staging URL. The Prisma runtime uses the pooled `DATABASE_URL`; migrations use `DIRECT_URL`. Follow `BACKUP_RESTORE.md`, `STAGING_QUALIFICATION.md`, and `PRODUCTION_SMOKE_TEST.md` before production promotion.

## Current verification limits

Dependencies were installed from a source-only copy with pnpm and Prisma 7 validation/generation, 50 automated tests, the static build, and 52 browser checks passed on 8 October 2026. `prisma migrate deploy` was attempted but the configured local PostgreSQL server was unavailable; no database was modified. Netlify and live PostgreSQL/Stripe/Gemini/Resend/S3/Upstash/monitoring, DNS/TLS, and backup restoration remain external verification steps.
