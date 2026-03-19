-- CreateTable
CREATE TABLE "public"."AdminSceneDraft" (
    "sceneId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sourceSceneUpdatedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSceneDraft_pkey" PRIMARY KEY ("sceneId")
);

-- CreateIndex
CREATE INDEX "AdminSceneDraft_chapterId_idx" ON "public"."AdminSceneDraft"("chapterId");
