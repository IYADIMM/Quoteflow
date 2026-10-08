ALTER TABLE "Quote" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Quote" ADD COLUMN "sourceQuoteId" TEXT;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL;
CREATE INDEX "Quote_sourceQuoteId_idx" ON "Quote"("sourceQuoteId");
