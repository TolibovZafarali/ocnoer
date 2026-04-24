import {
  resolvePlayerProgressConflict,
  type PlayerProgress,
  type PlayerProgressConflictSource
} from "@ocnoer/story-core";

import { createPlayerProgressClient } from "../api/playerProgressClient";
import {
  clearProgressByPlayerId,
  loadProgressByPlayerId,
  saveProgressByPlayerId
} from "../storage/playerProgressStorage";

export type SyncedPlayerProgressResult = {
  progress: PlayerProgress | null;
  source: PlayerProgressConflictSource | "local-cache";
  warning: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function loadSyncedPlayerProgress(input: {
  playerId: string;
  token: string;
}): Promise<SyncedPlayerProgressResult> {
  const localProgress = await loadProgressByPlayerId(input.playerId);
  const client = createPlayerProgressClient();
  let serverProgress: PlayerProgress | null = null;

  try {
    serverProgress = (await client.getProgress(input.token)).progress;
  } catch (error) {
    return {
      progress: localProgress,
      source: localProgress ? "local-cache" : "none",
      warning: getErrorMessage(
        error,
        "Unable to load backend progress. Using local cache."
      )
    };
  }

  const resolved = resolvePlayerProgressConflict({
    localProgress,
    serverProgress
  });

  if (resolved.progress) {
    await saveProgressByPlayerId(input.playerId, resolved.progress);
  } else {
    await clearProgressByPlayerId(input.playerId);
  }

  if (resolved.source === "local" && resolved.progress) {
    try {
      await client.saveProgress(input.token, resolved.progress);
    } catch (error) {
      return {
        progress: resolved.progress,
        source: resolved.source,
        warning: getErrorMessage(
          error,
          "Unable to upload local progress to the backend."
        )
      };
    }
  }

  return {
    progress: resolved.progress,
    source: resolved.source,
    warning: null
  };
}

export async function saveSyncedPlayerProgress(input: {
  playerId: string;
  token: string;
  progress: PlayerProgress;
}) {
  await saveProgressByPlayerId(input.playerId, input.progress);

  try {
    const result = await createPlayerProgressClient().saveProgress(
      input.token,
      input.progress
    );

    if (!result.saved) {
      await saveProgressByPlayerId(input.playerId, result.progress);
    }

    return {
      warning: null
    };
  } catch (error) {
    return {
      warning: getErrorMessage(
        error,
        "Saved locally, but backend progress sync failed."
      )
    };
  }
}

export async function clearSyncedPlayerProgress(input: {
  playerId: string;
  token: string;
}) {
  await createPlayerProgressClient().clearProgress(input.token);
  await clearProgressByPlayerId(input.playerId);
}
