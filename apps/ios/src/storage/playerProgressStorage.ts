import AsyncStorage from "@react-native-async-storage/async-storage";

import { parsePlayerProgress, type PlayerProgress } from "@ocnoer/story-core";

const PROGRESS_STORAGE_KEY_PREFIX = "ocnoer.mobile.playerProgress";

function getProgressStorageKey(playerId: string) {
  return `${PROGRESS_STORAGE_KEY_PREFIX}:${playerId}`;
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

  const progress = parsePlayerProgress(parsed);

  if (!progress) {
    await clearProgressByPlayerId(playerId);
    return null;
  }

  return progress;
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
