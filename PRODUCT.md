# Product brief

## Positioning

QuoteFlow helps suppliers, distributors, contractors and B2B service teams move an incoming request into a clear, margin-aware quotation and remember to follow up.

## Core loop

RFQ → review items → price → preview quote → share → customer response → follow up.

## Primary users

- Sales representative: create a quote from a request with fewer repeated entries.
- Sales manager: see quote outcomes, due follow-ups and indicative gross margin.
- Owner: set basic company and commercial defaults and understand the pipeline.

## Product scope in this build

The current build supports account creation with a two-step business setup flow, tenant-scoped server records, country and default-currency selection, RFQ/catalog/customer/quote/follow-up workflows, catalog and manual quote lines in one currency, server quote totals and minimum-price checks, explicit approval records, editable drafts, immutable sent revisions, send-time customer snapshots, public-link rotation/revocation/expiry, and customer accept/reject/question responses. The browser locale suggests a market, but the user confirms it; the server validates and persists account defaults. RFQs are created manually or from user-pasted text; automatic email inbox ingestion is not implemented. Attachments can be uploaded to configured private storage, but OCR and automatic attachment extraction are not implemented. Gemini assists only after an explicit user action. Customer questions are stored as quote events before seller notification is attempted. The seller experience includes an attention dashboard, per-currency summaries, live margin visibility, global search, clear next actions, responsive quote building, customer-safe server PDFs, optional private RFQ attachments, plan usage and Stripe-hosted billing.

## Commercial model hypothesis

Free, Pro and Business are implemented as configurable entitlement labels backed by Stripe Price IDs. No monetary amount is hard-coded. Pricing and packaging remain unvalidated hypotheses until customer interviews and paid pilots establish willingness to pay.

## Success measures to collect after a privacy-reviewed launch

Activation (first quote), time from RFQ to saved quote, quotes per active organization, customer portal views, response and acceptance rate, follow-up completion, free-to-paid conversion, retention, churn, gross margin, and support burden. The build does not transmit product analytics.
