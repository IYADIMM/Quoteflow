# Deployment

## Local development

Use Node.js 22.13+ and PostgreSQL. Copy `.env.example` to `.env`, configure local database URLs, then run `docker compose up -d`, `npm install`, and `npm run dev`. The dev script generates the client/build, applies migrations, and runs Netlify Dev on port 8888.

## Netlify

Set the build command to `npm run build`, publish directory to `dist`, and function directory to `netlify/functions` (also declared in `netlify.toml`). Configure `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (HTTPS), and a strong `SESSION_SECRET`. Configure `AI_ENABLED`/`GEMINI_API_KEY` for Gemini and `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, and `EMAIL_FROM` for transactional email. Store secrets in Netlify environment variables, never in source control.

Run `npm run db:migrate` against the production database as a release step before switching traffic. The Prisma runtime uses the pooled `DATABASE_URL`; migrations use `DIRECT_URL`. Back up the database and verify restore procedures before onboarding customers.

## Current verification limits

This workspace did not have project dependencies installed, a reachable PostgreSQL database, or production credentials. The source includes the Netlify, Prisma/PostgreSQL, Gemini and Resend integrations, but live migration, deployment, AI inference and email delivery have not been verified here. Billing, PDF generation, uploads/object storage and customer-question notifications are not implemented.
