# Engineering handover

The sole active serverless runtime is `netlify/functions/api.mjs`; the account API uses Prisma/PostgreSQL, and Netlify serves the generated `dist/` site. The former SQLite prototype and duplicate app copy have been removed.

For setup and environment variables, see [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md). Use Node.js 22.13+, install from `package.json`, configure PostgreSQL, generate the Prisma client, and run migrations before starting account mode.

The code includes Gemini and Resend provider paths with mocked tests. Production credentials, live PostgreSQL migration, Netlify deployment, live email and AI calls were unavailable in this workspace. Stripe billing, PDF generation, uploads/object storage, and customer-question notifications remain unimplemented. Existing demo data is fictional.
