# Operating Cost Model

Use actual provider calculators and invoices before pricing. This framework intentionally contains no fabricated totals.

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
