# Technical Inventory

## Runtime and assets

- Static HTML/CSS/JavaScript frontend built into `dist/`.
- One Netlify Function API in `netlify/functions/api.mjs`.
- PostgreSQL through Prisma 7 and `@prisma/adapter-pg`; migrations in `prisma/migrations`.
- Fixed-point commercial engine, catalog/manual normalization, Gemini, Resend, Stripe, PDFKit, S3 and Upstash adapters under `lib/`.
- Browser-local fictional demo isolated from authenticated account records.

## Complete in code and automated tests

Tenant sessions/switching, role checks, verified-email policy, distributed auth/public limiting, ownership transfer, safe user deletion constraints, customer/catalog/RFQ/quote workflows, commercial pricing/approval/revision/send/public links, customer responses, Gemini schema validation, Resend adapter, Stripe Checkout/Portal/webhook state, centralized entitlements, server PDFs, S3 upload validation, monitoring adapter, owner export/deletion request, health/request IDs, CI, database qualification and build scripts.

## Implemented but externally unverified

Managed PostgreSQL migrations/runtime, live Netlify function bundle, Stripe test Checkout/webhooks/Portal, Resend domain delivery, Gemini inference, S3-compatible signed operations, Upstash REST, DNS/TLS, monitoring alerts and backup restoration.

## Known limitations

- No live database was available for migration/integration testing in this workspace.
- Attachment extraction accepts a safe upload lifecycle but does not yet extract PDF/Office/image text into Gemini; pasted text is the supported AI input.
- Malware scanning is a documented hook, not an integrated scanner.
- Organization deletion is scheduled/recorded for operator processing; no automatic destructive worker is shipped.
- Secure ownership transfer, password change and logout-other-sessions are exposed in Settings. Team role change/removal and safe user deletion have server APIs but no complete Settings flow. Email change remains unimplemented.
- Large authenticated lists load the tenant dataset for the current frontend; database pagination is not yet implemented for 10,000-record workspaces.
- Application logs, health and a generic webhook monitoring adapter exist; a live monitoring vendor and alert routes remain unverified.

These limits should be addressed before broad self-service launch. They do not block a controlled, operator-assisted beta after live staging verification.
