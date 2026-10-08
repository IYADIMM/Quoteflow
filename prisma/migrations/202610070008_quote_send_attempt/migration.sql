ALTER TABLE "Quote" ADD COLUMN "sendAttemptKey" TEXT;
ALTER TABLE "Quote" ADD COLUMN "sendAttemptState" TEXT;
ALTER TABLE "Quote" ADD COLUMN "sendAttemptAt" TIMESTAMP(3);
