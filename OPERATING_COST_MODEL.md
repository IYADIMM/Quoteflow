# Operating Cost Model

Use actual provider calculators and invoices before pricing. The estimates below were checked against public provider prices on 8 October 2026 and remain planning assumptions rather than quotations.

| Driver | Unit | Measurement source | Cost control |
|---|---|---|---|
| Netlify | requests, bandwidth, function time | Netlify invoice/logs | cache static assets, bound API work |
| PostgreSQL | compute, storage, connections, backups | DB provider | pooled runtime URL, indexes, retention |
| Gemini | input/output tokens | AIUsage + provider invoice | plan quotas, input bounds, explicit actions |
| Resend | delivered emails | Resend | transactional only, safe retry policy |
| Stripe | payment volume/transactions | Stripe | hosted flows; model fees by geography |
| Object storage | GB-month, PUT/GET, egress | storage provider | quotas, private lifecycle cleanup |
| Upstash | commands | Upstash | narrow public scopes and bounded windows |
| Monitoring/support | events and staff time | provider/time tracking | alert quality, runbooks |

Monthly gross margin model: subscription revenue minus payment fees, variable provider usage, allocated infrastructure and direct support. Separate fixed founder/operator labor from scalable COGS. Recalculate at 10, 100 and 1,000 active organizations using measured RFQs, quotes, AI calls, emails, storage and support hours per organization.

## Buyer planning scenarios

Assume a controlled beta with up to 10 organizations, fewer than 1,000 quotes, 3,000 transactional emails, 500,000 rate-limit commands, 5 GB of attachments, and low Gemini token use per month.

| Scenario | Estimated monthly platform cost | Assumptions |
|---|---:|---|
| Evaluation/test | USD 0–20 | Free tiers where eligible; no uptime commitment; domain excluded. |
| Controlled paid beta | USD 50–100 | Netlify Pro USD 20, low-usage managed PostgreSQL about USD 8–25, Resend Pro USD 20, and USD 0–35 combined for AI, storage, rate limiting and monitoring. |
| Production with stronger operational guarantees | USD 250+ | Provider HA/SLA, longer database recovery, paid monitoring/support and usage overages can dominate the beta estimate. |

Stripe is excluded from the monthly platform total because it is transaction based. For a UAE account, the public standard domestic-card rate was 2.9% + AED 1.00 per successful transaction; international cards and currency conversion add fees. Domain registration, taxes, operator/support labor, legal/compliance work and independent security testing are also excluded.

Reference prices used for the estimate: [Netlify pricing](https://www.netlify.com/pricing/), [Neon usage pricing explanation](https://neon.com/blog/new-usage-based-pricing), [Resend pricing](https://resend.com/pricing), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Upstash Redis pricing](https://upstash.com/pricing/redis), and [Stripe UAE pricing](https://stripe.com/ae/pricing). Recheck every calculator before purchase.
