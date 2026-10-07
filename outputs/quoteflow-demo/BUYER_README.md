# Buyer README

## Product

QuoteFlow is an early server-backed RFQ and quotation workflow for small B2B suppliers and service businesses. It captures requests, prices offers with margin visibility, creates a customer-facing snapshot and records response.

## Current technology

The existing UI is vanilla JavaScript/CSS/HTML. A Node 24 server uses experimental SQLite for local development, with server-side sessions and organization-scoped API routes. `prisma/` describes the PostgreSQL target but is not yet connected to the running API. Provider interfaces exist for AI, email, PDF and billing; integrations are not configured.

## Monetization hypothesis

Free, Pro ($39/month) and Business ($99/month) are unvalidated initial plan hypotheses. There is no checkout, billing enforcement, MRR or customer traction claim.

## Growth opportunities

First migrate the API to managed PostgreSQL and harden authentication, tenant authorization, recovery, email delivery, PDF generation and operations. Then validate the quoting workflow with target businesses. Vertical expansion may include contractors, interiors, wholesale and services.

## Due diligence

No production users, revenue, accounts or service credentials are included. This build is not ready for real customer data. Verify migrations, permissions, recovery, backups, public-link behavior, and legal/privacy obligations before deployment.
