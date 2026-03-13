-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'player');

-- CreateEnum
CREATE TYPE "public"."DialogueKind" AS ENUM ('narrator', 'speech', 'thought', 'player_prompt');

-- CreateEnum
CREATE TYPE "public"."AssetType" AS ENUM ('background_image', 'background_music', 'portrait', 'other');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "notes" TEXT,
    "defaultPortraitPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Chapter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Scene" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "backgroundImagePath" TEXT,
    "backgroundMusicPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DialogueEntry" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "kind" "public"."DialogueKind" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "promptLabel" TEXT,
    "characterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialogueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SceneAsset" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "type" "public"."AssetType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "altText" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayerResponse" (
    "id" TEXT NOT NULL,
    "dialogueEntryId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Character_slug_key" ON "public"."Character"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_slug_key" ON "public"."Chapter"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_orderIndex_key" ON "public"."Chapter"("orderIndex");

-- CreateIndex
CREATE INDEX "Scene_chapterId_idx" ON "public"."Scene"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_chapterId_orderIndex_key" ON "public"."Scene"("chapterId", "orderIndex");

-- CreateIndex
CREATE INDEX "DialogueEntry_sceneId_idx" ON "public"."DialogueEntry"("sceneId");

-- CreateIndex
CREATE INDEX "DialogueEntry_characterId_idx" ON "public"."DialogueEntry"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueEntry_sceneId_orderIndex_key" ON "public"."DialogueEntry"("sceneId", "orderIndex");

-- CreateIndex
CREATE INDEX "SceneAsset_sceneId_idx" ON "public"."SceneAsset"("sceneId");

-- CreateIndex
CREATE INDEX "SceneAsset_type_idx" ON "public"."SceneAsset"("type");

-- CreateIndex
CREATE INDEX "PlayerResponse_dialogueEntryId_idx" ON "public"."PlayerResponse"("dialogueEntryId");

-- CreateIndex
CREATE INDEX "PlayerResponse_sceneId_idx" ON "public"."PlayerResponse"("sceneId");

-- CreateIndex
CREATE INDEX "PlayerResponse_chapterId_idx" ON "public"."PlayerResponse"("chapterId");

-- CreateIndex
CREATE INDEX "PlayerResponse_userId_idx" ON "public"."PlayerResponse"("userId");

-- AddForeignKey
ALTER TABLE "public"."Scene" ADD CONSTRAINT "Scene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DialogueEntry" ADD CONSTRAINT "DialogueEntry_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "public"."Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DialogueEntry" ADD CONSTRAINT "DialogueEntry_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "public"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SceneAsset" ADD CONSTRAINT "SceneAsset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "public"."Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerResponse" ADD CONSTRAINT "PlayerResponse_dialogueEntryId_fkey" FOREIGN KEY ("dialogueEntryId") REFERENCES "public"."DialogueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerResponse" ADD CONSTRAINT "PlayerResponse_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "public"."Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerResponse" ADD CONSTRAINT "PlayerResponse_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerResponse" ADD CONSTRAINT "PlayerResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

