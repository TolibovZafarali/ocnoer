-- Published runtime refactor:
-- - add stable public ids to authored content
-- - introduce published version metadata
-- - migrate prompt responses away from authoring-table foreign keys
-- - add reading progress checkpoints pinned to published versions

ALTER TABLE "public"."Character"
  ADD COLUMN "publicId" TEXT;

ALTER TABLE "public"."Chapter"
  ADD COLUMN "publicId" TEXT;

ALTER TABLE "public"."Scene"
  ADD COLUMN "publicId" TEXT;

ALTER TABLE "public"."DialogueEntry"
  ADD COLUMN "publicId" TEXT;

UPDATE "public"."Character"
SET "publicId" = 'char_' || substr(md5("id" || ':character'), 1, 24)
WHERE "publicId" IS NULL;

UPDATE "public"."Chapter"
SET "publicId" = 'chapter_' || substr(md5("id" || ':chapter'), 1, 24)
WHERE "publicId" IS NULL;

UPDATE "public"."Scene"
SET "publicId" = 'scene_' || substr(md5("id" || ':scene'), 1, 24)
WHERE "publicId" IS NULL;

UPDATE "public"."DialogueEntry"
SET "publicId" = 'entry_' || substr(md5("id" || ':dialogue-entry'), 1, 24)
WHERE "publicId" IS NULL;

ALTER TABLE "public"."Character"
  ALTER COLUMN "publicId" SET NOT NULL;

ALTER TABLE "public"."Chapter"
  ALTER COLUMN "publicId" SET NOT NULL;

ALTER TABLE "public"."Scene"
  ALTER COLUMN "publicId" SET NOT NULL;

ALTER TABLE "public"."DialogueEntry"
  ALTER COLUMN "publicId" SET NOT NULL;

CREATE UNIQUE INDEX "Character_publicId_key" ON "public"."Character"("publicId");
CREATE UNIQUE INDEX "Chapter_publicId_key" ON "public"."Chapter"("publicId");
CREATE UNIQUE INDEX "Scene_publicId_key" ON "public"."Scene"("publicId");
CREATE UNIQUE INDEX "DialogueEntry_publicId_key" ON "public"."DialogueEntry"("publicId");

CREATE TABLE "public"."PublishedStoryVersion" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "manifestStoragePath" TEXT NOT NULL,
  "storagePrefix" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "PublishedStoryVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublishedStoryVersion_version_key" ON "public"."PublishedStoryVersion"("version");
CREATE UNIQUE INDEX "PublishedStoryVersion_storagePrefix_key" ON "public"."PublishedStoryVersion"("storagePrefix");

INSERT INTO "public"."PublishedStoryVersion" (
  "id",
  "version",
  "isActive",
  "manifestStoragePath",
  "storagePrefix"
) VALUES (
  'legacy-published-story-version',
  0,
  false,
  'runtime/legacy/manifest.json',
  'runtime/legacy'
);

ALTER TABLE "public"."PlayerResponse"
  ADD COLUMN "publishedVersionId" TEXT,
  ADD COLUMN "chapterPublicId" TEXT,
  ADD COLUMN "chapterTitle" TEXT,
  ADD COLUMN "chapterSlug" TEXT,
  ADD COLUMN "chapterOrderIndex" INTEGER,
  ADD COLUMN "scenePublicId" TEXT,
  ADD COLUMN "sceneTitle" TEXT,
  ADD COLUMN "sceneOrderIndex" INTEGER,
  ADD COLUMN "dialogueEntryPublicId" TEXT,
  ADD COLUMN "promptLabel" TEXT,
  ADD COLUMN "promptText" TEXT;

UPDATE "public"."PlayerResponse" AS pr
SET
  "publishedVersionId" = 'legacy-published-story-version',
  "chapterPublicId" = chapter."publicId",
  "chapterTitle" = chapter."title",
  "chapterSlug" = chapter."slug",
  "chapterOrderIndex" = chapter."orderIndex",
  "scenePublicId" = scene."publicId",
  "sceneTitle" = scene."title",
  "sceneOrderIndex" = scene."orderIndex",
  "dialogueEntryPublicId" = entry."publicId",
  "promptLabel" = entry."promptLabel",
  "promptText" = entry."text"
FROM "public"."Chapter" AS chapter,
     "public"."Scene" AS scene,
     "public"."DialogueEntry" AS entry
WHERE chapter."id" = pr."chapterId"
  AND scene."id" = pr."sceneId"
  AND entry."id" = pr."dialogueEntryId";

ALTER TABLE "public"."PlayerResponse"
  ALTER COLUMN "publishedVersionId" SET NOT NULL,
  ALTER COLUMN "chapterPublicId" SET NOT NULL,
  ALTER COLUMN "chapterTitle" SET NOT NULL,
  ALTER COLUMN "chapterSlug" SET NOT NULL,
  ALTER COLUMN "chapterOrderIndex" SET NOT NULL,
  ALTER COLUMN "scenePublicId" SET NOT NULL,
  ALTER COLUMN "sceneOrderIndex" SET NOT NULL,
  ALTER COLUMN "dialogueEntryPublicId" SET NOT NULL,
  ALTER COLUMN "promptText" SET NOT NULL;

ALTER TABLE "public"."PlayerResponse"
  DROP CONSTRAINT IF EXISTS "PlayerResponse_dialogueEntryId_fkey",
  DROP CONSTRAINT IF EXISTS "PlayerResponse_sceneId_fkey",
  DROP CONSTRAINT IF EXISTS "PlayerResponse_chapterId_fkey";

ALTER TABLE "public"."PlayerResponse"
  DROP COLUMN "dialogueEntryId",
  DROP COLUMN "sceneId",
  DROP COLUMN "chapterId";

CREATE INDEX "PlayerResponse_publishedVersionId_idx" ON "public"."PlayerResponse"("publishedVersionId");
CREATE INDEX "PlayerResponse_chapterPublicId_idx" ON "public"."PlayerResponse"("chapterPublicId");
CREATE INDEX "PlayerResponse_scenePublicId_idx" ON "public"."PlayerResponse"("scenePublicId");
CREATE INDEX "PlayerResponse_dialogueEntryPublicId_idx" ON "public"."PlayerResponse"("dialogueEntryPublicId");

ALTER TABLE "public"."PlayerResponse"
  ADD CONSTRAINT "PlayerResponse_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId")
  REFERENCES "public"."PublishedStoryVersion"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE TABLE "public"."ReadingProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "publishedVersionId" TEXT NOT NULL,
  "chapterPublicId" TEXT NOT NULL,
  "scenePublicId" TEXT NOT NULL,
  "dialogueEntryPublicId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingProgress_userId_key" ON "public"."ReadingProgress"("userId");
CREATE INDEX "ReadingProgress_publishedVersionId_idx" ON "public"."ReadingProgress"("publishedVersionId");

ALTER TABLE "public"."ReadingProgress"
  ADD CONSTRAINT "ReadingProgress_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "public"."User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE,
  ADD CONSTRAINT "ReadingProgress_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId")
  REFERENCES "public"."PublishedStoryVersion"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
