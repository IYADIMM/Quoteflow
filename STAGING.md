# Staging Environment

Staging must use separate PostgreSQL, Stripe test-mode, Resend test/domain, Gemini project, storage bucket, Upstash database and Netlify site. Do not reuse production credentials or customer data.

Required rules:

1. Use a unique HTTPS `APP_URL`; configure Stripe redirects/webhook and Resend links to that origin.
2. Use `NODE_ENV=production` so fail-closed configuration validation runs.
3. Apply migrations through `DIRECT_URL`; functions use the pooled `DATABASE_URL`.
4. Create test Stripe products/prices and subscribe only with Stripe test cards.
5. Keep the bucket private; set short CORS allowance only for the staging origin and PUT methods required by signed uploads.
6. Use obviously fictional customers and addresses. Never clone production without a written sanitization procedure.
7. Run `npm run release:check` and the complete production smoke test before promotion.

Promotion means repeating the release against production configuration. Staging success does not validate production DNS, sender reputation, live Stripe keys, backup policy or provider quotas.
