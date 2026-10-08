# Stripe Test Mode Qualification

1. In Stripe test mode, create QuoteFlow Pro and Business products with recurring Prices. Put their `price_...` IDs in `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`.
2. Set `STRIPE_ENABLED=true`, a test `sk_test_...` key, and a test webhook signing secret. Never mix test and live values.
3. Create a webhook for `https://STAGING_HOST/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.payment_failed`
4. From a verified Owner account, start Checkout. Use Stripe's documented successful test card and confirm customer reuse, organization metadata, subscription row, plan, and entitlements.
5. Open the Customer Portal, schedule cancellation, and confirm `cancelAtPeriodEnd` and period end synchronize after the webhook. Cancel immediately in Stripe and confirm the deleted subscription event updates access.
6. Use Stripe's documented failure test method to produce `invoice.payment_failed`; confirm PAST_DUE and the configured grace behavior. Complete payment and confirm a paid/succeeded event restores ACTIVE.
7. Retry a delivered webhook and confirm the same event ID returns success without a second state change.
8. Confirm invalid signatures return 400, an unlinked subscription event is retried with a 500, and no secret or card data appears in QuoteFlow logs.

Record Checkout session, Customer, Subscription, webhook event IDs, QuoteFlow organization ID, timestamps, and outcomes. Do not record secret keys or full payment details.
