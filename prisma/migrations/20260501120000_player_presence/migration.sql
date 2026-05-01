ALTER TABLE "public"."PlayerProfile"
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE INDEX "PlayerProfile_lastSeenAt_idx" ON "public"."PlayerProfile"("lastSeenAt");
