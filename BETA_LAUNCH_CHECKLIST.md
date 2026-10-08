# Beta Launch Checklist

- [ ] Complete every credential-dependent staging smoke step.
- [ ] Run a successful PostgreSQL migration and isolated restore drill.
- [ ] Configure monitoring/alerts and name an on-call owner.
- [ ] Verify Stripe test billing, cancellation and failed-payment grace behavior.
- [ ] Verify SPF, DKIM and DMARC; test bounce handling and controlled quote delivery.
- [ ] Configure private storage, lifecycle policy and malware scanning decision.
- [ ] Obtain legal review of terms, privacy, retention and acceptance language.
- [ ] Recruit a small set of named design partners; use written feedback consent.
- [ ] Provide an operator-led onboarding call and define support hours/escalation.
- [ ] Measure only factual activation: organization configured, first customer/catalog item, first RFQ, first quote, first send, first response.
- [ ] Do not claim revenue, ROI, security certification or customer validation until evidence exists.

Recommended beta gate: controlled organizations only, manual account review, documented backups, daily operator checks, and no unsupported regulated/sensitive data.
