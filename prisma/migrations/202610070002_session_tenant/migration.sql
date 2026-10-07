ALTER TABLE "Session" ADD COLUMN "organizationId" TEXT;

-- Existing session rows must be explicitly associated with one of the user's organizations.
-- Do not guess a tenant during a production migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Session" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill Session.organizationId from a verified Membership before applying this migration.';
  END IF;
END $$;

ALTER TABLE "Session" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
CREATE INDEX "Session_organizationId_expiresAt_idx" ON "Session"("organizationId", "expiresAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
