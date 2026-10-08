CREATE TABLE "QuoteApproval" (
  "id" TEXT PRIMARY KEY,
  "quoteId" TEXT NOT NULL,
  "quoteVersion" INTEGER NOT NULL,
  "approverUserId" TEXT NOT NULL,
  "financialHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "QuoteApproval_quoteId_quoteVersion_key" ON "QuoteApproval"("quoteId", "quoteVersion");
