-- CreateEnum
CREATE TYPE "public"."PlayerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "public"."PlayerProfile" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "catName" TEXT,
    "catNameLocked" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_usernameNormalized_key" ON "public"."PlayerProfile"("usernameNormalized");

-- CreateIndex
CREATE INDEX "PlayerProfile_status_idx" ON "public"."PlayerProfile"("status");
