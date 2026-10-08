ALTER TABLE "Subscription"
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "stripeProductId" TEXT,
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "trialEnd" TIMESTAMP(3),
  ADD COLUMN "lastStripeSyncAt" TIMESTAMP(3);

ALTER TABLE "Attachment"
  ADD COLUMN "rfqId" TEXT,
  ADD COLUMN "quoteId" TEXT,
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RFQ_ATTACHMENT',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 's3';

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE;
CREATE INDEX "Attachment_organizationId_rfqId_status_idx" ON "Attachment"("organizationId", "rfqId", "status");
CREATE INDEX "Attachment_organizationId_quoteId_status_idx" ON "Attachment"("organizationId", "quoteId", "status");
CREATE UNIQUE INDEX "Attachment_organizationId_storageKey_key" ON "Attachment"("organizationId", "storageKey");

CREATE TABLE "StripeEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadHash" TEXT NOT NULL,
  CONSTRAINT "StripeEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL
);
CREATE INDEX "StripeEvent_organizationId_processedAt_idx" ON "StripeEvent"("organizationId", "processedAt");

CREATE TABLE "OrganizationDeletionRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "canceledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationDeletionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE INDEX "OrganizationDeletionRequest_organizationId_scheduledFor_idx" ON "OrganizationDeletionRequest"("organizationId", "scheduledFor");
