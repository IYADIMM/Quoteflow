# Product overview

QuoteFlow supports supplier teams as they receive RFQs, review requested items, prepare catalog-based quotes, send customer links, and manage follow-ups. A fictional browser demo is available without an account; account workspaces use a PostgreSQL-backed Netlify API.

Account features include organization-scoped customer/catalog/RFQ/quote/follow-up data, role checks, margin-aware quote calculations, public quote responses, team invitations, account recovery and verification flows, Gemini-assisted extraction and customer follow-up copy, and transactional email through Resend when configured.

AI suggestions require a user action and human review. They never determine price, cost, tax, or final contract terms. Quote acceptance is an application record and not a certified digital signature.

This build has not undergone external security certification. Stripe billing, PDF generation, file uploads/storage, and customer-question notifications are not available. Live PostgreSQL, Netlify, Gemini, and email behavior must be verified in the target environment.
