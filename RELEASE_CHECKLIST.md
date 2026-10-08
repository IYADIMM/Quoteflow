# Release Checklist

## Before staging

- [ ] Review schema/migration; create pre-migration backup.
- [ ] Run `pnpm install --frozen-lockfile` with pnpm 11.25.0.
- [ ] Run `pnpm run release:check` and confirm exact test count.
- [ ] Scan dependencies and secrets; review `DEPENDENCY_LICENSE_INVENTORY.md`.
- [ ] Confirm `.env` is ignored and no credentials are in source or build output.
- [ ] Review negative search results for TODO/FIXME/mock/demo/localhost/console output.

## Staging

- [ ] Run `pnpm run db:migrate` with the staging direct URL, then `pnpm run db:qualify` against that isolated database.
- [ ] Deploy and complete `STAGING_QUALIFICATION.md` and `PRODUCTION_SMOKE_TEST.md`.
- [ ] Verify Stripe signature/replay, Resend delivery, Gemini fallback, storage MIME rejection, PDF contents, Upstash throttling and request IDs.
- [ ] Complete an isolated database restore drill.
- [ ] Check mobile, keyboard, screen-reader names, focus order and 100-line quote PDF.

## Production

- [ ] Confirm domain/TLS, `APP_URL`, sender DNS, provider modes and alert recipients.
- [ ] Take and verify pre-migration backup.
- [ ] Apply forward-only migrations, then deploy the tested artifact.
- [ ] Smoke health, sign-in, tenant switch, quote view and Stripe webhook.
- [ ] Record deploy ID, migration set, operator and outcome.

Rollback the application to the prior Netlify deploy when safe. Database migrations use a forward-recovery migration; do not run destructive resets or ad-hoc rollbacks.
