# Customer Acceptance Checklist

Record environment, candidate commit, deploy ID, database, operator, timestamps, and evidence links. Use fictional organizations and controlled recipients.

## Account and organization

- [ ] Register with email/password, complete business profile, and confirm country/currency defaults.
- [ ] Receive verification email, verify, sign out/in, recover password, and confirm expired/used tokens fail.
- [ ] Invite each role; verify organization switching and cross-tenant denial.

## RFQ to quotation

- [ ] Create/edit/archive customer and catalog records.
- [ ] Create a manual RFQ and a pasted-text RFQ; confirm no automatic mailbox-ingestion claim.
- [ ] Upload a valid private attachment and reject MIME spoofing; confirm no automatic OCR claim.
- [ ] Create a mixed catalog/manual quote in USD and KWD; reject a cross-currency catalog line.
- [ ] Verify quantity, discount allocation, tax, total, cost, profit, margin, minimum price, and exact decimal persistence.
- [ ] Trigger low-margin review; deny salesperson self-approval; approve as manager; invalidate approval after a material change.

## Document and lifecycle

- [ ] Generate and visually inspect normal and 100-line PDFs; verify no internal financial data.
- [ ] Send once; repeat the idempotency key and confirm no duplicate email.
- [ ] View in a separate browser; confirm a VIEWED event without revision change.
- [ ] Ask a question; confirm storage before notification and rate limiting.
- [ ] Accept and reject exact revisions; verify expiry prevents response.
- [ ] Rotate and revoke links; verify old tokens fail.
- [ ] Create a revision and duplicate; confirm prior snapshots remain unchanged.
- [ ] Complete follow-up and confirm dashboard/analytics updates by currency.

## Providers and operations

- [ ] Run Gemini valid/error/timeout/quota/malformed-output cases.
- [ ] Verify Resend verification, recovery, invite, quote, and question delivery plus a provider rejection.
- [ ] Complete Stripe sandbox checkout, signed webhooks, replay, portal, cancellation, payment failure, recovery, and entitlement changes.
- [ ] Verify private storage CORS/access, distributed limiting across instances, redacted monitoring, backup, and isolated restore.
- [ ] Complete mobile, keyboard, screen-reader name, focus order, and error-state checks.

Any failed critical checkbox is a NO-GO.
