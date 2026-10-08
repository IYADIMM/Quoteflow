-- Timestamp of the newest Stripe event applied to this organization's subscription.
-- Older delivered events cannot overwrite a newer reconciled billing state.
ALTER TABLE "Subscription" ADD COLUMN "lastStripeEventAt" TIMESTAMP(3);
