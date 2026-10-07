# Deployment

## Development server

Node.js 24 currently runs the SQLite adapter with:

```sh
node --experimental-sqlite server.mjs
```

Set `PORT`, `APP_URL`, and optionally `QUOTE_DATABASE_PATH`. Database directories are created automatically. Back up the SQLite file only for local evaluation.

## PostgreSQL target

`prisma/schema.prisma` and `prisma/migrations/202610070001_init/migration.sql` are the target model/migration. Configure `DATABASE_URL`, install dependencies from the package manifest in a network-enabled environment, run `npx prisma generate`, then `npx prisma migrate deploy`. The current API still uses SQLite; deploying it against PostgreSQL currently has no effect until the API persistence code is migrated. The Prisma migration has not been run in this environment.

## Production blocker checklist

Before a public launch, migrate persistence to PostgreSQL, move to a supported stable Node LTS, configure HTTPS and Secure cookies, replace process-local rate limits, add deployment secret management and database backups, and complete email/recovery, server-side PDF, AI, payment/webhook, uploads, privacy/legal review, logs and monitoring. `.env.example` lists setting names; values shown there are placeholders only.
