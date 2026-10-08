# Product brief

## Positioning

QuoteFlow helps suppliers, distributors, contractors and B2B service teams move an incoming request into a clear, margin-aware quotation and remember to follow up.

## Core loop

RFQ → review items → price → preview quote → share → customer response → follow up.

## Demo personas

- Sales representative: create a quote from a request with fewer repeated entries.
- Sales manager: see quote outcomes, due follow-ups and indicative gross margin.
- Owner: set basic company and commercial defaults and understand the pipeline.

## Product scope in this build

The current build supports local account creation and tenant-scoped server records, a separate fictional browser-local demo, RFQ/catalog/customer/quote/follow-up workflows, catalog and manual quote lines in one currency, server quote totals and minimum-price checks, explicit approval records, editable drafts, immutable sent revisions, send-time customer snapshots, public-link rotation/revocation/expiry, and customer accept/reject/question responses. Customer questions are stored as quote events before seller notification is attempted. The seller experience includes an attention dashboard, per-currency summaries, live margin visibility, global search, clear next actions, responsive quote building, customer-safe server PDFs, optional private RFQ attachments, plan usage and Stripe-hosted billing. CSV, deterministic local parser and demo follow-up drafts remain frontend helpers.

## Commercial model hypothesis

Free, Pro and Business are implemented as configurable entitlement labels backed by Stripe Price IDs. No monetary amount is hard-coded. Pricing and packaging remain unvalidated hypotheses until customer interviews and paid pilots establish willingness to pay.

## Success measures to collect after a privacy-reviewed launch

Activation (first quote), time from RFQ to saved quote, quotes per active organization, customer portal views, response and acceptance rate, follow-up completion, free-to-paid conversion, retention, churn, gross margin, and support burden. The build does not transmit product analytics.
