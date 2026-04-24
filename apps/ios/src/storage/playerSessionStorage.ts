import * as SecureStore from "expo-secure-store";

import type {
  MobilePlayer,
  MobilePlayerSession,
  MobilePlayerSessionPayload
} from "../api/playerSessionTypes";

const PLAYER_SESSION_STORAGE_KEY = "ocnoer.mobile.playerSession";
const PLAYER_SESSION_STORAGE_SCHEMA_VERSION = 1;

export type StoredPlayerSession = {
  schemaVersion: typeof PLAYER_SESSION_STORAGE_SCHEMA_VERSION;
  session: MobilePlayerSession;
  player: MobilePlayer;
};

function isStoredPlayerSession(value: unknown): value is StoredPlayerSession {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as {
    schemaVersion?: unknown;
    session?: {
      token?: unknown;
      expiresAt?: unknown;
    };
    player?: {
      id?: unknown;
      firstName?: unknown;
      catName?: unknown;
      catNameLocked?: unknown;
    };
  };

  return (
    candidate.schemaVersion === PLAYER_SESSION_STORAGE_SCHEMA_VERSION &&
    typeof candidate.session?.token === "string" &&
    typeof candidate.session.expiresAt === "string" &&
    typeof candidate.player?.id === "string" &&
    typeof candidate.player.firstName === "string" &&
    (typeof candidate.player.catName === "string" ||
      candidate.player.catName === null) &&
    typeof candidate.player.catNameLocked === "boolean"
  );
}

export function toStoredPlayerSession(
  payload: MobilePlayerSessionPayload
): StoredPlayerSession {
  return {
    schemaVersion: PLAYER_SESSION_STORAGE_SCHEMA_VERSION,
    session: payload.session,
    player: payload.player
  };
}

export async function loadStoredPlayerSession() {
  const value = await SecureStore.getItemAsync(PLAYER_SESSION_STORAGE_KEY);

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

  if (!isStoredPlayerSession(parsed)) {
    await clearStoredPlayerSession();
    return null;
  }

  return parsed;
}

export async function saveStoredPlayerSession(
  payload: MobilePlayerSessionPayload
) {
  const storedSession = toStoredPlayerSession(payload);

  await SecureStore.setItemAsync(
    PLAYER_SESSION_STORAGE_KEY,
    JSON.stringify(storedSession)
  );

  return storedSession;
}

export async function clearStoredPlayerSession() {
  await SecureStore.deleteItemAsync(PLAYER_SESSION_STORAGE_KEY);
}
