import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  normalizeCatNameInput,
  validateCatNameInput
} from "@ocnoer/story-core";

import type { MobilePlayer } from "../api/playerSessionTypes";
import type { StoredPlayerSession } from "./playerSessionStorage";

const OFFLINE_PLAYER_STORAGE_KEY = "ocnoer.mobile.offlinePlayer";

export const OFFLINE_PLAYER: Readonly<MobilePlayer> = {
  id: "offline-reader",
  firstName: "Reader",
  catName: null,
  catNameLocked: false
};

export function createOfflinePlayerSession(
  player: MobilePlayer = OFFLINE_PLAYER
): StoredPlayerSession {
  return {
    schemaVersion: 1,
    session: {
      token: "offline-local-session",
      expiresAt: "9999-12-31T23:59:59.999Z"
    },
    player: {
      ...OFFLINE_PLAYER,
      catName: player.catName,
      catNameLocked: player.catName != null && player.catNameLocked
    }
  };
}

export async function loadOfflinePlayerSession() {
  const value = await AsyncStorage.getItem(OFFLINE_PLAYER_STORAGE_KEY);
  let saved: unknown = null;

  try {
    saved = value ? JSON.parse(value) : null;
  } catch {
    return createOfflinePlayerSession();
  }

  if (typeof saved !== "object" || saved == null) {
    return createOfflinePlayerSession();
  }

  const candidate = saved as { catName?: unknown; catNameLocked?: unknown };

  if (
    typeof candidate.catName !== "string" ||
    validateCatNameInput(candidate.catName) != null
  ) {
    return createOfflinePlayerSession();
  }

  return createOfflinePlayerSession({
    ...OFFLINE_PLAYER,
    catName: normalizeCatNameInput(candidate.catName),
    catNameLocked: candidate.catNameLocked === true
  });
}

export async function saveOfflinePlayerSession(player: MobilePlayer) {
  const session = createOfflinePlayerSession(player);

  await AsyncStorage.setItem(
    OFFLINE_PLAYER_STORAGE_KEY,
    JSON.stringify({
      catName: session.player.catName,
      catNameLocked: session.player.catNameLocked
    })
  );

  return session;
}

export function withOfflineCatName(player: MobilePlayer, input: string) {
  if (player.catName && player.catNameLocked) {
    return player;
  }

  const validationError = validateCatNameInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  return {
    ...OFFLINE_PLAYER,
    catName: normalizeCatNameInput(input),
    catNameLocked: true
  };
}
