# Security Release Review

## Result

`SOURCE_VERIFIED` for implemented controls; live security qualification remains `BLOCKED` by the unavailable staging database. No independent penetration test has been performed.

## Verified in source and automated tests

- Salted scrypt password hashing; random session bearers stored as SHA-256 hashes.
- HttpOnly, SameSite session cookie; production Secure attribute; separate CSRF cookie/header and same-origin validation.
- Active organization bound to the server session; membership and role re-derived for requests.
- Tenant-scoped queries for business records and sensitive actions; explicit role gates.
- Single-use hashed recovery, verification, invitation, and public-link tokens with expiry.
- Sent quotation snapshots and customer documents exclude cost, margin, profit, minimum prices, approvals, and internal notes.
- Server-authoritative pricing, catalog snapshots, currency checks, minimum-price checks, approval fingerprints, immutable sent revisions, and response version binding.
- Stripe signature verification, unique event IDs, stale-event protection, and no card data processing.
- Bounded bodies, validation, attachment magic-byte checks, private object keys, provider timeouts, redacted monitoring, and token-safe paths.
- Production configuration fails closed for invalid PostgreSQL URL, insecure `APP_URL`, or incomplete enabled providers.
- Production dependency advisory check reports no known vulnerabilities.

## Material limitations

- PostgreSQL tenant isolation is implemented in application queries; database-level RLS is not established. If Supabase Data API access is enabled, restrict grants and apply reviewed RLS before exposure.
- Distributed rate limiting, sender-domain security, Stripe replay behavior, private bucket policy/CORS, and monitoring have mock coverage only.
- Upload signature checks are not malware scanning.
- Customer acceptance is an application record, not a certified digital signature.
- Restore procedures are documented but have not been executed.
- Current browser IDOR, CSRF, XSS, accessibility, and session tests have not run against this candidate on staging.

## Release security gate

Complete `STAGING_QUALIFICATION.md`, review Supabase/PostgreSQL grants, run a restore drill, verify logs contain no sensitive payloads, and obtain an independent security review before broad commercial exposure.
