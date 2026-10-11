# Final Test Results

**Execution date:** 11 October 2026  
**Environment:** Windows, Node.js 24.21.0, pnpm 11.25.0

| Command or check | Result | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | Lockfile current; completed successfully. |
| `pnpm run db:validate` | PASS | Prisma schema valid. |
| `pnpm run db:generate` | PASS | Prisma Client 7.10.0 generated. |
| `pnpm test` | PASS | 66 passed, 0 failed, 0 skipped. |
| `pnpm run build` | PASS | Prisma generation and static build completed. |
| `pnpm run release:check` | PASS | Prisma validation/generation, 66 tests, build, and `RELEASE_CHECK_PASSED`. |
| `pnpm audit --prod --audit-level high` | PASS | No known vulnerabilities. Initial sandbox request failed on DNS; approved network retry passed. |
| `pnpm run db:migrate` | FAIL | Configured local PostgreSQL at `localhost:5432/quoteflow` was unavailable; no migration was applied. |
| `pnpm run db:qualify` | BLOCKED | `STAGING_DATABASE_URL` absent; safety guard refused execution. |
| GitHub PR #2 `validate` | PASS for `8265f55` | Completed successfully on GitHub. Final-fix commit still needs its own CI run. |
| Netlify `/api/health` | FAIL | HTTP 503, `{"ok":false,"database":"unavailable"}` at 16:32 GST. |
| Current candidate browser E2E | NOT TESTED | Requires reachable migrated PostgreSQL and redeployed exact commit. |
| Live provider tests | NOT TESTED | No local Gemini, Resend, Stripe, storage, Upstash, or monitoring credentials. |

## Automated behavior covered

Pricing and discount reconciliation, catalog/manual quote lines, currency enforcement, approval policies, public quote version behavior, question retention on email failure, expiry, send idempotency, Stripe webhook ordering/idempotency, authentication limits, email verification, tenancy, ownership, customer archival, PDF protection, AI validation, storage validation, monitoring redaction, and entitlements.

Mocked provider tests prove application behavior around adapters. They do not prove credentials, provider account configuration, DNS, delivery, payment settlement, CORS, network latency, or provider availability.
