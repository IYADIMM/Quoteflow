# Security status

The code includes production-oriented controls, but it has not had a full independent security assessment or live deployment verification.

## Implemented controls

- Scrypt password hashes with unique salts, random session tokens stored as hashes, tenant-bound session records, cookie expiry, HttpOnly/SameSite attributes, and Secure in production.
- Users may have multiple memberships. The active organization is selected from server-validated memberships, stored on the session, and its role is derived again for each request. The workspace switcher never grants access based only on a browser-supplied organization ID.
- Current membership validation and organization-scoped record queries; server role checks protect settings, catalog writes, team actions, and quote mutations.
- Origin validation and a CSRF cookie/header pair for authenticated mutations; bounded API request bodies and input validation.
- Hashed, expiring, single-use email verification/reset/invitation tokens; reset revokes active sessions; recovery responses avoid account enumeration.
- Public quote links store only token hashes and return a customer-safe send-time snapshot. The send reservation writes the hash and exact snapshot before handing the raw URL to the email provider. Outcomes use quote version checks and a unique acceptance record without changing the commercial revision number.
- Server-side quote calculations use catalog cost/tax/currency snapshots, validate manual line currency, enforce catalog minimum prices and tenant margin rules, record manager approvals against quote revision/financial hash, and prevent edits to sent quotes. Sent quotes can be duplicated into a new revision.
- Public links use hashed bearer tokens with expiry, seller revocation and rotation. Customer responses atomically revalidate the active token and expiry. Send attempts reserve state, use idempotency keys, and keep ambiguous outcomes from being retried automatically.
- Customer questions are length/email validated, stored as quote events before optional notification, and limited to five per quote per ten minutes.
- Optional Upstash REST limiting hashes public subjects before storage and adds a cross-instance limit while preserving the database fallback.
- Stripe webhook signatures are verified before processing; event IDs are unique, raw card data never reaches QuoteFlow, and plan state is derived from persisted webhook data.
- Uploads are tenant scoped, size/type/extension checked, use unpredictable keys and signed URLs, and have server-side magic-byte verification before becoming ready.
- Customer PDFs are generated from immutable snapshots and omit cost, margin, profit, minimum prices and internal approval data.
- AI usage is reserved transactionally against plan and per-IP/per-tenant request windows; RFQ content is treated as untrusted model input and validated outputs remain suggestions.
- Netlify headers include CSP, frame restrictions, MIME sniffing protection and referrer policy. The site publishes only the generated `dist/` folder.

## Remaining security work

- Add comprehensive role/IDOR/CSRF/XSS and dependency audits, security event alerting, restore drills, and a third-party review.
- Configure and load-test the optional distributed limiter before exposing a multi-instance public deployment.
- Configure a malware-scanning/quarantine service for uploaded Office/PDF/image documents before enabling uploads for untrusted external senders. Current magic-byte verification is a format check, not antivirus.
- Define email-verification enforcement policy. The verification flow and Resend adapter exist, but emails are sent only when configured and delivery was not live-tested here.
- Confirm business/legal retention, privacy, and signature requirements before treating customer acceptance as legally binding.

Use HTTPS, production secrets, managed PostgreSQL backups, and a reviewed deployment before onboarding real customers. Quote acceptance is an application record, not a certified digital signature.
