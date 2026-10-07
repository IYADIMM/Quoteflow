# Security status

The code includes production-oriented controls, but it has not had a full independent security assessment or live deployment verification.

## Implemented controls

- Scrypt password hashes with unique salts, random session tokens stored as hashes, tenant-bound session records, cookie expiry, HttpOnly/SameSite attributes, and Secure in production.
- Users may have multiple memberships. The active organization is selected from server-validated memberships, stored on the session, and its role is derived again for each request. The workspace switcher never grants access based only on a browser-supplied organization ID.
- Current membership validation and organization-scoped record queries; server role checks protect settings, catalog writes, team actions, and quote mutations.
- Origin validation and a CSRF cookie/header pair for authenticated mutations; bounded API request bodies and input validation.
- Hashed, expiring, single-use email verification/reset/invitation tokens; reset revokes active sessions; recovery responses avoid account enumeration.
- Public quote links store only token hashes and return a customer-safe send-time snapshot. Outcomes use quote version checks and a unique acceptance record.
- Server-side quote calculations use catalog cost and tax, enforce catalog minimum prices and tenant margin rules, and prevent edits after sending.
- AI usage is reserved transactionally against plan and per-IP/per-tenant request windows; RFQ content is treated as untrusted model input and validated outputs remain suggestions.
- Netlify headers include CSP, frame restrictions, MIME sniffing protection and referrer policy. The site publishes only the generated `dist/` folder.

## Remaining security work

- Replace or supplement database-count rate limiting with an external distributed limiter for high-volume deployment; conduct load and contention testing.
- Add comprehensive role/IDOR/CSRF/XSS and dependency audits, security event alerting, restore drills, and a third-party review.
- Add public-link revocation/rotation controls and notification delivery for customer questions.
- Define email-verification enforcement policy. The verification flow and Resend adapter exist, but emails are sent only when configured and delivery was not live-tested here.
- Confirm business/legal retention, privacy, and signature requirements before treating customer acceptance as legally binding.

Use HTTPS, production secrets, managed PostgreSQL backups, and a reviewed deployment before onboarding real customers. Quote acceptance is an application record, not a certified digital signature.
