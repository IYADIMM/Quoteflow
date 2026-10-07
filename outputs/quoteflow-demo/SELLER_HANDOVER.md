# QuoteFlow seller handover

## Asset overview

An early server-backed RFQ/quotation application that preserves the visual design and core demo. It supports local account creation, role membership, organization-scoped API data, quote pricing/snapshot, public response and a separate fictional demo.

## Local operation

Requires Node 24 with its experimental SQLite module. Start with `node --experimental-sqlite server.mjs`; default port is 4173 and default database is `work/quoteflow.sqlite`. Set `PORT`, `APP_URL` and `QUOTE_DATABASE_PATH` as needed. SQLite is a local development adapter. Do not use it as a horizontally scaled production database.

## Database transition

Prisma schema and first PostgreSQL migration are included under `prisma/`. The API is not yet migrated to Prisma. In a network-enabled development environment, install packages, generate the Prisma client, migrate a disposable Postgres instance, then port and test each repository query before deployment.

## Integrations and operations

AI, email, PDF and billing provider interfaces are present but not connected. Password recovery/verification tokens are server-side, but email delivery and recovery UI are incomplete. There are no cloud accounts, customer records or API credentials bundled here. Demo samples are fictional.

## Readiness

The product is suitable for technical evaluation, not production customer onboarding. Complete Postgres migration, authorization coverage, recovery/email, PDF, billing, AI, backups, monitoring, legal review and tenant/security tests. No revenue or traction is claimed.
