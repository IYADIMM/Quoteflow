# Release Status

## STAGING_READY — pending live qualification

The source previously passed local clean-install checks and GitHub pull-request CI. On 11 October 2026, the current release-candidate workspace passed Prisma validation and generation, all 66 automated tests, the static build, and a production dependency advisory check. GitHub PR #2 passed at commit `8265f55`; the final audit fixes require a new CI run after push. The revised signup and business onboarding flow has not received a current browser automation run; prior demo-oriented browser evidence is historical and does not qualify this branch.

Source corrections include discount reconciliation, margin policy consistency, customer maintenance, canonical PDF archival, Stripe webhook reconciliation and ordering, strict past-due grace handling, sanitized customer-link logs and serializable quote/team/storage quota reservations.

This is **not** BETA_READY or PRODUCTION_READY. The connected Netlify staging health endpoint currently returns 503 with `database: unavailable`. Managed PostgreSQL migrations/runtime, a current signup-to-quote browser walk-through, real Stripe/Resend/Gemini/S3/Upstash/monitoring smoke tests, and an independent restore drill remain to be completed.

Do not imply that CI validates credentials, live provider behavior or that these staging gates have passed.
