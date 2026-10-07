# Architecture

## Current runtime

- `server.mjs`: Node HTTP server, Node experimental SQLite persistence, session resolution, auth, tenant-scoped API, public quote access and static frontend delivery.
- `app.js`, `styles.css`, `index.html`: preserved vanilla frontend and QuoteFlow interaction model.
- `lib/pricing.mjs`: validated quote calculation and proportional discount allocation (discount allocated by each line's pre-discount revenue; tax calculated after line allocation).
- `lib/ai-provider.mjs`, `lib/providers.mjs`: provider contracts and schema validation. Provider implementations are not connected.
- `prisma/schema.prisma`, `prisma/migrations/`: intended PostgreSQL persistence schema and initial migration. Current API does not yet use Prisma.
- `work/quoteflow.sqlite`: local development database; do not deploy it on shared/multi-instance hosting.

## Server boundaries

Session cookie is HttpOnly and SameSite=Lax; the server hashes session IDs at rest and derives tenant scope from membership. Record queries include the authenticated organization. Public quote access hashes a random bearer token and serves an allow-listed snapshot. Quote calculations run on the server; acceptance uses a database transaction and unique acceptance row. Demo records have a separate table and API.

## Target production architecture

Migrate every API query to Prisma/PostgreSQL with tenant-scoped service functions, relational record snapshots, transaction-safe organization-specific quote counters and serializable status transitions. Run PostgreSQL migrations as a required deployment step. Add a maintained authentication library, verified email/reset delivery, CSRF tokens, robust rate-limiting storage, object storage, PDF/email/AI/Stripe adapters, observability, backups and integration tests.

## Provider contracts

AI extraction validates suggested item names/quantity/unit/source/confidence but never sets price, cost, tax or contract terms. Email, PDF and billing interfaces currently throw a clear unconfigured error. Configure secrets server-side only and encrypt organization-level integration credentials at rest.
