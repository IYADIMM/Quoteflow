# Release Status

## STAGING_READY — pending live qualification

The source has passed local clean-install checks and GitHub pull-request CI. The original buyer clean-install run recorded 50 automated tests and 52 fictional browser checks. The targeted launch-audit correction pull request adds regression tests; use the latest GitHub Actions run for the current automated test count. The amended customer maintenance UI still needs its own live browser review after deployment.

Source corrections include discount reconciliation, margin policy consistency, customer maintenance, canonical PDF archival, Stripe webhook reconciliation and ordering, strict past-due grace handling, sanitized customer-link logs and serializable quote/team/storage quota reservations.

This is **not** BETA_READY or PRODUCTION_READY. Managed PostgreSQL migrations/runtime, isolated Netlify staging, real Stripe/Resend/Gemini/S3/Upstash/monitoring smoke tests, an independent restore drill and a browser walk-through of the new customer controls remain to be completed.

Do not imply that CI validates credentials, live provider behavior or that these staging gates have passed.
