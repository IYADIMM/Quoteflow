ALTER TABLE "AIUsage" ADD COLUMN "requestKey" TEXT;
CREATE INDEX "AIUsage_requestKey_createdAt_idx" ON "AIUsage"("requestKey", "createdAt");
