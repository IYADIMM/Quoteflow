# Production Smoke Test

Record date, environment, deploy ID, operator and evidence links. Use fictional data and a controlled recipient.

1. Health returns 200 and a request ID.
2. Register, receive verification email, verify, sign out/in and recover password.
3. Configure an organization; invite a second role and verify tenant switching.
4. Add customer/catalog item; create RFQ with a valid attachment; reject a spoofed MIME upload.
5. Run Gemini extraction, review suggestions and confirm manual workflow remains available.
6. Create mixed catalog/manual quote; trigger low-margin approval; verify salesperson denial and manager approval.
7. Generate server PDF; inspect currency, revision, pagination and absence of cost/margin/internal data.
8. Send to controlled email; open public link in a private browser; confirm one VIEWED event without version change.
9. Ask a question; confirm activity persists and seller email is attempted. Trigger rate limit.
10. Accept exact revision; verify duplicate/collision denial. Create revision and confirm old document remains unchanged.
11. Rotate link; old token fails/new token works. Revoke; new token fails. Test quote expiry.
12. Complete Stripe test Checkout, verify signed webhook/subscription/entitlement, open Customer Portal, cancel at period end and verify webhook state.
13. Verify data export, operator-assisted deletion request/cancellation, structured logs, monitoring alerts, private storage objects and backup freshness.
14. Execute isolated restore drill and verify recovered commercial records.

### Current execution record — 2026-10-08

Automated release checks pass with 50 tests; Prisma validation/generation and static build pass. Earlier browser workflow QA passed 51 checks. Live steps 1–14 were not executed because PostgreSQL and external provider credentials/endpoints were unavailable. `prisma migrate deploy` was attempted and failed before migration because localhost PostgreSQL was unavailable. Status remains `STAGING_READY`.
