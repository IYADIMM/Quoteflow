# Buyer Due Diligence FAQ

## Is QuoteFlow live or generating revenue?

This repository contains no evidence of customers, revenue or market validation. Verify any separate seller claim independently.

## What is technically differentiated?

The value is the integrated RFQ-to-response workflow: fixed-point pricing, catalog/manual authority, minimum-price and margin approval, immutable sent revisions, safe public links, customer outcomes, server PDFs and SaaS billing/tenant infrastructure.

## What passed?

On 2026-10-08: a clean source-only dependency install, Prisma validation/generation, static build, 50 automated tests and 52 browser checks. Provider tests are mocks.

## What remains unverified?

Managed PostgreSQL migration/runtime, Netlify deployment, live Stripe/Resend/Gemini/S3/Upstash, DNS/TLS, monitoring alerts, backup restoration, malware scanning, legal/privacy terms and broad load/security testing.

## Is the app production ready?

It is a release candidate suitable for a controlled staging and operator-assisted beta after the external smoke and restore gates pass. It should not be represented as broadly production-proven.

## What is tightly coupled?

Netlify hosts the static/function deployment and Prisma targets PostgreSQL. Gemini, email, Stripe, storage and rate limiting are behind small adapters/configuration. Migrating the host still requires adapting the function entry point.

## Main known engineering risks

No live database/provider verification; missing automatic malware scanner; email change and some team/account UI remain incomplete; no large-dataset pagination; monitoring destination is not configured; organization deletion execution remains operator-assisted.

## Can a new team operate it?

The repository contains setup, architecture, security, provider, backup, release, smoke, incident, transfer and commercialization documents. A competent JavaScript/PostgreSQL/Netlify team should still budget a staging qualification sprint.
