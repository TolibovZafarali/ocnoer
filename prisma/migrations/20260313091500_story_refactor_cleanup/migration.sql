-- Cleanup phase for story admin refactor.
-- Run `node prisma/backfill-story-refactor.js` after additive migration and before this migration.

UPDATE "public"."Character" SET "houseId" = (
  SELECT "id" FROM "public"."House" WHERE "slug" = 'unassigned' LIMIT 1
)
WHERE "houseId" IS NULL;

ALTER TABLE "public"."Character"
  ALTER COLUMN "houseId" SET NOT NULL;

UPDATE "public"."Scene"
SET "backgroundImageAssetId" = fallback."id"
FROM (
  SELECT "id"
  FROM "public"."MediaAsset"
  WHERE "type" = 'background_image'
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS fallback
WHERE "backgroundImageAssetId" IS NULL;

ALTER TABLE "public"."Scene"
  ALTER COLUMN "backgroundImageAssetId" SET NOT NULL;

UPDATE "public"."Chapter"
SET "imageAssetId" = fallback."id"
FROM (
  SELECT "id"
  FROM "public"."MediaAsset"
  WHERE "type" = 'background_image'
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS fallback
WHERE "imageAssetId" IS NULL;

ALTER TABLE "public"."Chapter"
  ALTER COLUMN "imageAssetId" SET NOT NULL;

DROP TABLE IF EXISTS "public"."SceneAsset";

ALTER TABLE "public"."Scene"
  DROP COLUMN IF EXISTS "backgroundImagePath",
  DROP COLUMN IF EXISTS "backgroundMusicPath";

ALTER TABLE "public"."Character"
  DROP COLUMN IF EXISTS "defaultPortraitPath";

ALTER TABLE "public"."Chapter"
  DROP COLUMN IF EXISTS "isPublished";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AssetType'
      AND n.nspname = 'public'
  ) THEN
    DROP TYPE "public"."AssetType";
  END IF;
END $$;
