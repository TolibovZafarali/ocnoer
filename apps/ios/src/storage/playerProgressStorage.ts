import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  PLAYER_PROGRESS_SCHEMA_VERSION,
  type PlayerProgress
} from "@ocnoer/story-core";

const PROGRESS_STORAGE_KEY_PREFIX = "ocnoer.mobile.playerProgress";

function getProgressStorageKey(playerId: string) {
  return `${PROGRESS_STORAGE_KEY_PREFIX}:${playerId}`;
}

function isBranchFlagValue(value: unknown) {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

function isPlayerProgress(value: unknown): value is PlayerProgress {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as {
    schemaVersion?: unknown;
    chapterId?: unknown;
    sceneId?: unknown;
    dialogueEntryId?: unknown;
    branchFlags?: unknown;
    updatedAt?: unknown;
  };

  return (
    candidate.schemaVersion === PLAYER_PROGRESS_SCHEMA_VERSION &&
    typeof candidate.chapterId === "string" &&
    typeof candidate.sceneId === "string" &&
    typeof candidate.dialogueEntryId === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.branchFlags === "object" &&
    candidate.branchFlags != null &&
    Object.values(candidate.branchFlags).every(isBranchFlagValue)
  );
}

export async function loadProgressByPlayerId(playerId: string) {
  const value = await AsyncStorage.getItem(getProgressStorageKey(playerId));

  if (!value) {
    return null;
  }

  const parsed = (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })();

  if (!isPlayerProgress(parsed)) {
    await clearProgressByPlayerId(playerId);
    return null;
  }

  return parsed;
}

export async function saveProgressByPlayerId(
  playerId: string,
  progress: PlayerProgress
) {
  await AsyncStorage.setItem(
    getProgressStorageKey(playerId),
    JSON.stringify(progress)
  );
}

export async function clearProgressByPlayerId(playerId: string) {
  await AsyncStorage.removeItem(getProgressStorageKey(playerId));
}
