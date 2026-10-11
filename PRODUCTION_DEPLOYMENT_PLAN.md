# Production Deployment Plan

## Preconditions

1. PR CI passes on the exact candidate commit.
2. Isolated staging PostgreSQL is migrated and prints `DATABASE_QUALIFICATION_PASSED`.
3. Netlify staging health returns 200 and names PostgreSQL.
4. Full staging browser workflow, provider test modes, rate limits, logging, and restore drill pass.
5. `FINAL_GO_NO_GO.md` is changed to GO with evidence links.
6. The owner explicitly authorizes production deployment and migration.

## Controlled release

1. Record candidate commit, dependency lock hash, migration list, operator, and change window.
2. Confirm production `DATABASE_URL`, `DIRECT_URL`, HTTPS `APP_URL`, sender domain, provider modes, alerts, and rollback owner.
3. Take a pre-migration backup and verify its checksum and restore instructions.
4. Apply forward-only Prisma migrations through the direct URL. Never use `prisma migrate reset`.
5. Deploy the exact tested artifact to Netlify; record deploy ID and commit.
6. Run health, signup/login, tenant switch, quote view, public token, and Stripe webhook smoke checks with fictional data and controlled recipients.
7. Watch 5xx, database connections, email failures, Stripe retries, AI/storage errors, and backup status.

## Rollback

- If the application fails before a data migration dependency, restore the prior Netlify deploy.
- For schema problems, prefer a forward-recovery migration. Do not run ad hoc destructive rollback SQL.
- Restore into a new database only under the incident process in `BACKUP_RESTORE.md`; verify records before changing traffic.
- Revoke sessions and provider credentials if confidentiality could be affected.

No production action is authorized by this document.
