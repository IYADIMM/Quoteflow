# Security status

This is an early development build, not a security certification or completed penetration test.

## Implemented controls

- Passwords are hashed with Node scrypt; session bearer values are random and stored as SHA-256 hashes.
- Session cookies are HttpOnly, SameSite=Lax and Secure when `NODE_ENV=production`.
- User organization scope is derived from the session membership, not a request organization ID. CRUD reads/writes/deletes filter by organization.
- Owner/Admin checks protect settings and team routes. Sales mutations reject Viewer role.
- Public quote tokens are 256-bit random values, hashed in the database, rotated on send, and resolved to a customer-facing allow-list snapshot. Cost and margin are excluded.
- Public outcomes require a valid state, transaction, unique acceptance record and bounded input. Quote edits are rejected after sending.
- Request body limits, basic same-origin write checks, auth attempt throttling, output escaping and baseline CSP/security headers are present.
- Demo records are isolated from tenant records.

## Gaps requiring closure before production

- SQLite development storage and Node's experimental SQLite API are not production multi-instance infrastructure.
- The account email is not verified; verification and reset token APIs do not deliver email. Reset UI and secure operational flow are incomplete.
- Cookie CSRF protection is basic origin validation, not a synchronizer token; per-process rate limits do not work across instances.
- API role policy is incomplete for every resource and assigned-record access; UI can still show actions that server rejects.
- Quote customer inputs include client line cost; server calculations are authoritative for arithmetic but catalog prices/permissions are not fully server-selected.
- Public token expiry is based on quote date but has no revocation endpoint or persistent per-IP rate limit.
- Attachments, HTML upload parsing, PDF, email, AI, billing/webhook and admin endpoints are not implemented.
- No full IDOR/CSRF/XSS, dependency, load, backup-restore, or adversarial tenant suite has been run.

Do not store real customer or confidential commercial information in this build. Use HTTPS, PostgreSQL, secure deployment secrets and a professional security review before launch.
