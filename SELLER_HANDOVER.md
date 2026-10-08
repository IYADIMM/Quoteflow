# Engineering handover

The sole active serverless runtime is `netlify/functions/api.mjs`; the account API uses Prisma/PostgreSQL, and Netlify serves the generated `dist/` site. The former SQLite prototype and duplicate app copy have been removed.

For setup and environment variables, see [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md). Use Node.js 22.13+, install from `package.json`, configure PostgreSQL, generate the Prisma client, and run migrations before starting account mode.

Commercial quote workflow supports catalog/manual lines in a single quote currency, server-computed totals, minimum-price and margin controls, explicit approval, draft edits, immutable sent revisions, hashed public links with rotation/revocation/expiry, exact send-time customer snapshots, customer accept/reject/questions, and duplicate quotes with source history. Send attempts are idempotent where the client retains its request key; ambiguous provider outcomes remain blocked for manual review. Questions are stored before notification is attempted.

The code includes Gemini, Resend, Stripe, S3-compatible storage and Upstash provider paths with mocked tests. Server PDFs are generated from immutable snapshots. Prisma validation/client generation, 42 automated tests, the static build, and the previously established 51 browser workflow checks passed on 8 October 2026. A live PostgreSQL migration was attempted but the local server was unavailable. Production credentials, managed database migration, Netlify deployment, provider calls, backup restoration and monitoring remain for the acquiring operator. Existing demo data is fictional and browser-local. Start with `TRANSFER_CHECKLIST.md` and `OPERATIONS.md`.
