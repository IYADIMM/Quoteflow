# QuoteFlow

QuoteFlow is an early server-backed RFQ and quotation workflow for B2B suppliers and service teams.

## Run locally

Requires Node.js 24 for its experimental built-in SQLite development adapter:

```sh
node --experimental-sqlite server.mjs
```

Open `http://localhost:4173`. Demo data is fictional and isolated from account data in `work/quoteflow.sqlite`. `/login` offers account creation, sign-in and demo entry. The server stores user accounts and tenant records in SQLite for local development.

## Implemented

- Existing responsive QuoteFlow design and the demo workflow.
- Server-backed signup/sign-in/logout with scrypt password hashes and HttpOnly session cookies.
- Organization membership, role-aware settings/team checks, and organization-scoped customer, catalog, RFQ, quote and follow-up API records.
- Separate demo data store.
- Server-side quote calculations and margin rule checks.
- Secure random public token with only its hash stored; snapshot-on-send; sanitized public quote response; view/accept/reject events.
- Per-currency analytics, CSV tools, product docs, AI/provider interfaces and PostgreSQL/Prisma schema plus initial migration.

## Database target

The API currently runs on Node's experimental SQLite adapter for local use. `prisma/schema.prisma` and `prisma/migrations/` describe the PostgreSQL target, but the running API has not yet been migrated to Prisma and the migration was not run in this environment. SQLite is not suitable for multi-instance production hosting.

## Tests

Run unit and contract tests with `node --test tests/pricing.test.mjs tests/contracts.test.mjs`. The HTTP integration test is in `tests/api.integration.test.mjs`; this execution sandbox blocks loopback sockets, so it could not be run here.

## Known limitations

This is not production ready. Email sending, real AI inference, Stripe billing/webhooks, server-side PDF generation, uploads, email-based verification/recovery, recovery UI, complete invitations/roles, usage entitlements, admin console, and exhaustive security/performance testing remain incomplete. Quote acceptance is not a certified signature. Do not onboard real customers yet.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [DEPLOYMENT.md](DEPLOYMENT.md), [BUYER_README.md](BUYER_README.md), [SELLER_HANDOVER.md](SELLER_HANDOVER.md), and [ROADMAP.md](ROADMAP.md).
