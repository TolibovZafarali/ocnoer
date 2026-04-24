import { parsePlayerProgress, type PlayerProgress } from "@ocnoer/story-core";

import { createMobileApiClient, type MobileApiClient } from "./mobileApiClient";

export type PlayerProgressPayload = {
  progress: PlayerProgress | null;
};

export type SavePlayerProgressPayload = {
  progress: PlayerProgress;
  saved: boolean;
};

export type ClearPlayerProgressPayload = {
  progress: null;
  cleared: boolean;
};

export type PlayerProgressClient = {
  getProgress: (token: string) => Promise<PlayerProgressPayload>;
  saveProgress: (
    token: string,
    progress: PlayerProgress
  ) => Promise<SavePlayerProgressPayload>;
  clearProgress: (token: string) => Promise<ClearPlayerProgressPayload>;
};

function parseProgressFromPayload(payload: PlayerProgressPayload) {
  if (payload.progress == null) {
    return null;
  }

  const progress = parsePlayerProgress(payload.progress);

  if (!progress) {
    throw new Error("Backend returned invalid player progress.");
  }

  return progress;
}

export function createPlayerProgressClient(
  apiClient: MobileApiClient = createMobileApiClient()
): PlayerProgressClient {
  return {
    getProgress: async (token) => {
      const payload = await apiClient.requestJson<PlayerProgressPayload>(
        "/api/player/progress",
        {
          token
        }
      );

      return {
        progress: parseProgressFromPayload(payload)
      };
    },
    saveProgress: async (token, progress) => {
      const payload = await apiClient.requestJson<SavePlayerProgressPayload>(
        "/api/player/progress",
        {
          method: "PUT",
          token,
          body: {
            progress
          }
        }
      );
      const savedProgress = parsePlayerProgress(payload.progress);

      if (!savedProgress || typeof payload.saved !== "boolean") {
        throw new Error("Backend returned invalid player progress.");
      }

      return {
        progress: savedProgress,
        saved: payload.saved
      };
    },
    clearProgress: (token) =>
      apiClient.requestJson<ClearPlayerProgressPayload>(
        "/api/player/progress",
        {
          method: "DELETE",
          token
        }
      )
  };
}
