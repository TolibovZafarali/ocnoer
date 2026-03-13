-- Additive phase for story admin refactor.
CREATE TYPE "public"."MediaAssetType" AS ENUM ('background_image', 'background_music');

CREATE TABLE "public"."House" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "House_slug_key" ON "public"."House"("slug");

CREATE TABLE "public"."MediaAsset" (
  "id" TEXT NOT NULL,
  "type" "public"."MediaAssetType" NOT NULL,
  "storagePath" TEXT NOT NULL,
  "altText" TEXT,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storagePath_key" ON "public"."MediaAsset"("storagePath");
CREATE INDEX "MediaAsset_type_idx" ON "public"."MediaAsset"("type");

CREATE TABLE "public"."CharacterPortrait" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "label" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterPortrait_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterPortrait_characterId_idx" ON "public"."CharacterPortrait"("characterId");
CREATE INDEX "CharacterPortrait_sortOrder_idx" ON "public"."CharacterPortrait"("sortOrder");

CREATE TABLE "public"."SceneCharacterAppearance" (
  "id" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "portraitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SceneCharacterAppearance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SceneCharacterAppearance_sceneId_characterId_key" ON "public"."SceneCharacterAppearance"("sceneId", "characterId");
CREATE INDEX "SceneCharacterAppearance_sceneId_idx" ON "public"."SceneCharacterAppearance"("sceneId");
CREATE INDEX "SceneCharacterAppearance_characterId_idx" ON "public"."SceneCharacterAppearance"("characterId");
CREATE INDEX "SceneCharacterAppearance_portraitId_idx" ON "public"."SceneCharacterAppearance"("portraitId");

ALTER TABLE "public"."Character"
  ADD COLUMN "houseId" TEXT;

ALTER TABLE "public"."Chapter"
  ADD COLUMN "imageAssetId" TEXT;

ALTER TABLE "public"."Scene"
  ADD COLUMN "backgroundImageAssetId" TEXT,
  ADD COLUMN "backgroundMusicAssetId" TEXT;

CREATE INDEX "Character_houseId_idx" ON "public"."Character"("houseId");
CREATE INDEX "Chapter_imageAssetId_idx" ON "public"."Chapter"("imageAssetId");
CREATE INDEX "Scene_backgroundImageAssetId_idx" ON "public"."Scene"("backgroundImageAssetId");
CREATE INDEX "Scene_backgroundMusicAssetId_idx" ON "public"."Scene"("backgroundMusicAssetId");

ALTER TABLE "public"."CharacterPortrait"
  ADD CONSTRAINT "CharacterPortrait_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "public"."Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."SceneCharacterAppearance"
  ADD CONSTRAINT "SceneCharacterAppearance_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "public"."Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SceneCharacterAppearance_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "public"."Character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SceneCharacterAppearance_portraitId_fkey" FOREIGN KEY ("portraitId") REFERENCES "public"."CharacterPortrait"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "public"."House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Chapter"
  ADD CONSTRAINT "Chapter_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "public"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Scene"
  ADD CONSTRAINT "Scene_backgroundImageAssetId_fkey" FOREIGN KEY ("backgroundImageAssetId") REFERENCES "public"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Scene_backgroundMusicAssetId_fkey" FOREIGN KEY ("backgroundMusicAssetId") REFERENCES "public"."MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
