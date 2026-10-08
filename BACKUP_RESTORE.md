# PostgreSQL Backup and Restore

## Production policy

- Use a managed PostgreSQL plan with daily backups and point-in-time recovery. Target 30 days of daily retention and the provider’s maximum practical PITR window.
- The service owner owns restore testing; the database provider owns physical durability under its SLA.
- Run a manual backup immediately before every schema migration. Store dumps in a private, encrypted bucket separate from the primary database account.
- Never run `prisma migrate reset` against staging or production.

## Backup

Install PostgreSQL client tools and run:

```powershell
.\scripts\backup-postgres.ps1 -DatabaseUrl $env:DIRECT_URL -OutputDirectory D:\secure-backups\quoteflow
```

The script produces a custom-format dump and SHA-256 manifest. Protect the URL and dump as production secrets. Validate that the manifest hash matches after transfer.

## Isolated restore drill

Create an empty database whose name contains `restore`, `drill`, `staging`, or `test`, then run:

```powershell
.\scripts\restore-drill.ps1 -BackupFile D:\secure-backups\quoteflow\quoteflow-YYYYMMDDTHHMMSSZ.dump -TargetDatabaseUrl $env:RESTORE_DATABASE_URL
```

The script refuses an ordinary production-looking target name, restores with `--clean --if-exists`, and verifies core table readability and row counts. After it passes, run `npm run release:check` with `DATABASE_URL` pointed at the restored database and perform the customer portal smoke path.

## Recovery decision

1. Freeze writes or maintenance-mode the application.
2. Record the incident time and last known good transaction.
3. Prefer provider PITR for recent corruption; use the latest verified dump for provider/account loss.
4. Restore into a new database, verify schema and business records, then change Netlify environment variables.
5. Revoke active sessions if confidentiality may be affected.
6. Verify organizations, memberships, customers, catalog, RFQs, quote snapshots, public-token state, acceptances, audit logs, subscriptions and attachments before restoring traffic.

## Verification status

The scripts were syntax-reviewed in this workspace. A restore drill was not executable because PostgreSQL client tools and a running database were unavailable. This remains a release-blocking staging exercise.
