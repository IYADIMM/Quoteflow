# Transfer Checklist

## Before closing

- [ ] Confirm source, brand/domain, design and documentation ownership/assignment.
- [ ] Review direct and transitive licenses and any contractor assignments.
- [ ] Export current architecture, schema, migrations, tests and latest release evidence.
- [ ] Inventory Netlify, database, Stripe, Resend, Google AI, storage, Upstash, DNS and monitoring accounts.
- [ ] Decide account transfer versus buyer-created replacement for each provider.
- [ ] Prove any customer, revenue, MRR, traffic or retention statement independently.

## Credential cutover

- [ ] Buyer creates least-privilege production and staging credentials.
- [ ] Configure all variables from `.env.example`; never transmit `.env` in the repository.
- [ ] Replace Stripe webhook endpoint/secret and confirm event delivery.
- [ ] Verify sender domain DNS, storage bucket policy/CORS, database backups and monitoring recipients.
- [ ] Rotate database, provider and domain credentials after access changes.

## Technical acceptance

- [ ] `npm run release:check` passes on buyer infrastructure.
- [ ] Forward migrations apply to isolated staging.
- [ ] Complete `PRODUCTION_SMOKE_TEST.md` and restore drill.
- [ ] Buyer can deploy, roll back, inspect request IDs and handle the three incident playbooks.
- [ ] Seller removes access only after buyer validates operation and retains required evidence.

## Data and legal

- [ ] Execute data-processing/subprocessor updates, privacy/terms review and customer notices where required.
- [ ] Agree backup retention, historical logs and seller deletion certificate.
- [ ] Record excluded assets, open liabilities and unresolved risks in the purchase agreement.
