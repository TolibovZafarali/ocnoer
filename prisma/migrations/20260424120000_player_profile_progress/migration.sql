CREATE TABLE "public"."PlayerReadingProgress" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "chapterId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "dialogueEntryId" TEXT NOT NULL,
  "branchFlags" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "progressUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerReadingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerReadingProgress_playerId_key" ON "public"."PlayerReadingProgress"("playerId");
CREATE INDEX "PlayerReadingProgress_progressUpdatedAt_idx" ON "public"."PlayerReadingProgress"("progressUpdatedAt");

ALTER TABLE "public"."PlayerReadingProgress"
  ADD CONSTRAINT "PlayerReadingProgress_playerId_fkey"
  FOREIGN KEY ("playerId")
  REFERENCES "public"."PlayerProfile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
