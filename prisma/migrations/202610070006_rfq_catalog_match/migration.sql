ALTER TABLE "RFQItem" ADD COLUMN "catalogItemId" TEXT;
ALTER TABLE "RFQItem" ADD CONSTRAINT "RFQItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL;
CREATE INDEX "RFQItem_catalogItemId_idx" ON "RFQItem"("catalogItemId");
