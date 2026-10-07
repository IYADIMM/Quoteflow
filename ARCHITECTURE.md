# Architecture

## Runtime

- `app.js`, `styles.css`, and `index.html` provide the browser UI and fictional local demo.
- `netlify/functions/api.mjs` is the Netlify modern `Request`/`Response` entry point and handles auth, tenant APIs, AI/email workflows and public quote access.
- `lib/prisma.mjs` creates a reusable Prisma 7 client with the PostgreSQL driver adapter. Prisma schema and migrations are under `prisma/`.
- `lib/pricing.mjs` performs validated fixed-point quote calculations. Quote cost and tax are loaded from the tenant catalog on the server.
- `lib/ai-provider.mjs` calls Gemini through `@google/genai` and validates structured results. `lib/email-provider.mjs` sends via Resend.
- `scripts/build.mjs` writes only frontend assets to `dist`, the Netlify publish directory.

## Trust boundaries

Account session tokens are random, stored hashed, tenant-bound, and checked against current membership. A user can belong to multiple organizations; the active organization is held in the session, shown in the workspace switcher, and changed only after the server validates membership. The role is reloaded from the active membership on each request. Mutating requests require same-origin validation and the CSRF cookie/header pair. All account record routes scope database lookups to the session organization. AI prompts treat RFQ text as untrusted input, and extraction results are suggestions; they never author prices or tax. Public quote links are bearer capabilities; only a hash is stored and only the send-time customer-safe snapshot is returned. Acceptance records bind to the quote version.

The local demo uses browser storage and fictional sample records. It is separate from account mode and is not server-persisted.

## External services and gaps

PostgreSQL, Gemini, and Resend have production integration paths. They require environment credentials and live verification. Production configuration fails closed when PostgreSQL URL/origin is invalid, or when enabled Gemini/Resend configuration is incomplete. Session secrets are not used: session bearers are generated with cryptographic randomness and only their SHA-256 hashes are stored. Billing, PDF generation, uploads/object storage, customer-question notifications, and a full external rate-limiting service remain to be built. Treat public-link protections and API roles as requiring an independent security review before commercial deployment.
