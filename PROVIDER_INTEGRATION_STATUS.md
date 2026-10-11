# Provider Integration Status

| Provider | Source status | Live status | Exact requirement |
|---|---|---|---|
| PostgreSQL | Implemented with Prisma 7 and 13 ordered migrations | FAIL/BLOCKED | Managed staging database, pooled `DATABASE_URL`, direct `DIRECT_URL`, backup/PITR, migration and qualification. |
| Netlify | Build/function/routing configuration present | PARTIAL | Deploy exact candidate from Git; set site-level secrets; health must return 200. |
| Gemini via `@google/genai` | PASS (mocked) | NOT TESTED | Installed SDK 2.27.0 receives `responseJsonSchema`; optional catalog IDs use JSON Schema `type: ["string", "null"]` rather than provider `nullable`. Google AI Studio/Cloud account, staging `GEMINI_API_KEY`, supported model access, quota and timeout/error tests remain required. |
| Resend | PASS (mocked) | NOT TESTED | Resend account, verified sending domain, `EMAIL_PROVIDER=resend`, API key, `EMAIL_FROM`, SPF/DKIM/DMARC and controlled recipient. |
| Stripe Billing | PASS (mocked) | NOT TESTED | Stripe sandbox, restricted staging key where supported, webhook secret, recurring Pro/Business Price IDs, webhook endpoint and complete `STRIPE_STAGING.md`. |
| S3-compatible storage | PASS (mocked) | NOT TESTED | Private bucket, credentials or workload identity, endpoint/region, CORS, public-access block, lifecycle and quota tests. |
| Upstash | PASS (mocked) | NOT TESTED | Redis database, REST URL/token, multi-instance limit test. |
| Monitoring webhook | PASS (mocked) | NOT TESTED | HTTPS receiver and alert routing; verify redaction and request IDs. |

## Environment presence audit

Local `.env` contains local PostgreSQL and local HTTP application URLs. Gemini, email, Stripe, storage, Upstash, and monitoring secrets are absent. Secret values were not displayed or copied. The available Netlify connector does not expose site-level secret values.

Provider integrations are code-ready. None of the external providers is live-verified in this audit.
