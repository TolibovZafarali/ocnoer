import { Prisma } from "@prisma/client";

import {
  comparePlayerProgressUpdatedAt,
  parsePlayerProgress,
  type PlayerProgress
} from "@ocnoer/story-core";

import { prisma } from "@/lib/prisma";

export class PlayerProgressError extends Error {}

type PlayerReadingProgressRecord = {
  schemaVersion: number;
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  branchFlags: Prisma.JsonValue;
  progressUpdatedAt: Date;
};

export type SavePlayerProgressResult = {
  progress: PlayerProgress;
  saved: boolean;
};

function toProgressUpdatedAtDate(progress: Pick<PlayerProgress, "updatedAt">) {
  return new Date(progress.updatedAt);
}

function toProgressData(progress: PlayerProgress) {
  return {
    schemaVersion: progress.schemaVersion,
    chapterId: progress.chapterId,
    sceneId: progress.sceneId,
    dialogueEntryId: progress.dialogueEntryId,
    branchFlags: progress.branchFlags,
    progressUpdatedAt: toProgressUpdatedAtDate(progress)
  };
}

function toPlayerProgress(record: PlayerReadingProgressRecord) {
  const progress = parsePlayerProgress({
    schemaVersion: record.schemaVersion,
    chapterId: record.chapterId,
    sceneId: record.sceneId,
    dialogueEntryId: record.dialogueEntryId,
    branchFlags: record.branchFlags,
    updatedAt: record.progressUpdatedAt.toISOString()
  });

  if (!progress) {
    throw new PlayerProgressError("Stored player progress is invalid.");
  }

  return progress;
}

export function parsePlayerProgressRequestPayload(body: unknown) {
  const candidate =
    typeof body === "object" &&
    body != null &&
    "progress" in body &&
    (body as { progress?: unknown }).progress != null
      ? (body as { progress?: unknown }).progress
      : body;
  const progress = parsePlayerProgress(candidate);

  if (!progress) {
    throw new PlayerProgressError("Player progress payload is invalid.");
  }

  return progress;
}

export async function getPlayerProgress(playerId: string) {
  const record = await prisma.playerReadingProgress.findUnique({
    where: {
      playerId
    }
  });

  return record ? toPlayerProgress(record) : null;
}

export async function savePlayerProgress(input: {
  playerId: string;
  progress: PlayerProgress;
}): Promise<SavePlayerProgressResult> {
  const progress = parsePlayerProgress(input.progress);

  if (!progress) {
    throw new PlayerProgressError("Player progress payload is invalid.");
  }

  const existingRecord = await prisma.playerReadingProgress.findUnique({
    where: {
      playerId: input.playerId
    }
  });

  if (existingRecord) {
    const existingProgress = toPlayerProgress(existingRecord);

    if (comparePlayerProgressUpdatedAt(existingProgress, progress) > 0) {
      return {
        progress: existingProgress,
        saved: false
      };
    }
  }

  const savedRecord = await prisma.playerReadingProgress.upsert({
    where: {
      playerId: input.playerId
    },
    create: {
      playerId: input.playerId,
      ...toProgressData(progress)
    },
    update: toProgressData(progress)
  });

  return {
    progress: toPlayerProgress(savedRecord),
    saved: true
  };
}

export async function clearPlayerProgress(playerId: string) {
  await prisma.playerReadingProgress.deleteMany({
    where: {
      playerId
    }
  });
}
