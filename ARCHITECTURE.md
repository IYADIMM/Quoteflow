# Architecture

## Runtime

- `app.js`, `styles.css`, and `index.html` provide the browser UI and fictional local demo.
- `netlify/functions/api.mjs` is the Netlify modern `Request`/`Response` entry point and handles auth, tenant APIs, AI/email workflows and public quote access.
- `lib/prisma.mjs` creates a reusable Prisma 7 client with the PostgreSQL driver adapter. Prisma schema and migrations are under `prisma/`.
- `lib/pricing.mjs` performs validated fixed-point quote calculations. Catalog cost/tax/currency and descriptive snapshots are loaded from the tenant catalog on the server; manual lines are validated against the quote currency and commercial rules.
- `lib/ai-provider.mjs` calls Gemini through `@google/genai` and validates structured results. `lib/email-provider.mjs` sends via Resend.
- `lib/billing-provider.mjs` isolates Stripe Checkout, Customer Portal, signature verification and subscription normalization. `lib/entitlements.mjs` is the only plan-limit source.
- `lib/pdf-provider.mjs` renders immutable customer snapshots. `lib/storage-provider.mjs` validates and signs private S3-compatible objects. `lib/rate-limit.mjs` optionally uses Upstash REST for distributed public throttling.
- `scripts/build.mjs` writes only frontend assets to `dist`, the Netlify publish directory.

## Trust boundaries

Account session tokens are random, stored hashed, tenant-bound, and checked against current membership. A user can belong to multiple organizations; the active organization is held in the session, shown in the workspace switcher, and changed only after the server validates membership. The role is reloaded from the active membership on each request. Mutating requests require same-origin validation and the CSRF cookie/header pair. All account record routes scope database lookups to the session organization. AI prompts treat RFQ text as untrusted input, and extraction results are suggestions; they never author prices or tax. Public quote links are bearer capabilities; only a hash is stored and only the send-time customer-safe snapshot is returned. The raw link is returned to the current request and placed in the outbound message, but is not persisted in the snapshot. Acceptance records bind to the commercial revision represented in that snapshot. View, acceptance, rejection, and other lifecycle events do not increment the commercial revision; SENDING/SENT use send-attempt fields. Sent quote records are immutable; a new quote record can cite its source revision.

The local demo uses browser storage and fictional sample records. It is separate from account mode and is not server-persisted. Public customer questions are recorded as quote events before optional email notification. A database count remains the fallback limit; deployments can configure Upstash for a cross-instance limit.

## External services and gaps

PostgreSQL, Gemini, Resend, Stripe, private S3-compatible storage, and optional Upstash limiting have production integration paths. They require environment credentials and live verification. Production configuration fails closed when the database/origin is invalid or any explicitly enabled provider is incomplete. Session secrets are not used: session bearers are generated with cryptographic randomness and only their SHA-256 hashes are stored. Treat public-link protections, uploads, billing, and API roles as requiring an independent security review before broad commercial deployment.
