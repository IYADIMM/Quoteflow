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

The current build supports local account creation and tenant-scoped server records, a separate fictional demo, RFQ/catalog/customer/quote/follow-up workflows, server quote totals, quote snapshots and customer quote responses. CSV, browser-print PDF, deterministic local parser and follow-up drafts remain frontend helpers; they do not call a real AI, email or PDF service.

## Commercial model hypothesis

Initial positioning may be tested around Free, Pro at $39/month and Business at $99/month. These are unvalidated hypotheses, not market research or live subscriptions. A hosted version needs server-enforced limits and a real billing provider before charging.

## Success measures to collect after a privacy-reviewed launch

Activation (first quote), time from RFQ to saved quote, quotes per active organization, customer portal views, response and acceptance rate, follow-up completion, free-to-paid conversion, retention, churn, gross margin, and support burden. The build does not transmit product analytics.
