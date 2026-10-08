# Privacy and Data Handling Draft

This engineering draft requires legal review for the operator’s jurisdiction and actual provider contracts.

QuoteFlow stores account identity, organization membership, customer contacts, RFQs, attachments, catalog data, quotations, public responses, audit activity, subscription metadata and operational logs. It does not collect card details; Stripe hosts payment entry. Gemini receives only user-submitted RFQ text for explicit AI actions. Resend receives recipient/message data. The selected storage provider receives private objects.

Purpose: provide and secure the quotation workflow, send transactional messages, enforce subscriptions, support users, prevent abuse and meet legal obligations. Operators must document lawful basis, retention periods, subprocessors, cross-border transfers and data-subject contacts.

Owners can export organization records and schedule deletion with a seven-day cooling period. The current repository records deletion requests; an operator must run and document the deletion procedure across PostgreSQL, object storage, backups and providers. Backups may retain deleted data until expiry under the retention policy and must remain access restricted.

Do not upload secrets, special-category personal data, payment-card data, or documents beyond the organization’s authority. Public quote links are bearer links and should be shared only with intended recipients.
