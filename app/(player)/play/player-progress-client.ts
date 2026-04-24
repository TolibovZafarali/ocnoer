"use client";

import {
  parsePlayerProgress,
  resolvePlayerProgressConflict,
  type PlayerProgress
} from "@ocnoer/story-core";

const PLAYER_PROGRESS_API_PATH = "/api/player/progress";

type PlayerProgressResponse = {
  progress: PlayerProgress | null;
};

type SavePlayerProgressResponse = {
  progress: PlayerProgress;
  saved: boolean;
};

export type PlayerProgressLoadResult = {
  progress: PlayerProgress | null;
  warning: string | null;
};

function readResponseJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function getResponseErrorMessage(payload: unknown, fallback: string) {
  if (
    typeof payload === "object" &&
    payload != null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function readCachedPlayerProgress(storageKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  const parsed = (() => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  })();
  const progress = parsePlayerProgress(parsed);

  if (!progress) {
    window.localStorage.removeItem(storageKey);
    return null;
  }

  return progress;
}

export function persistCachedPlayerProgress(
  storageKey: string,
  progress: PlayerProgress | null
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!progress) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(progress));
}

export async function fetchServerPlayerProgress() {
  const response = await fetch(PLAYER_PROGRESS_API_PATH, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(
      getResponseErrorMessage(
        payload,
        `Unable to load player progress (${response.status}).`
      )
    );
  }

  const candidate = (payload as PlayerProgressResponse | null)?.progress;

  if (candidate == null) {
    return null;
  }

  const progress = parsePlayerProgress(candidate);

  if (!progress) {
    throw new Error("Backend returned invalid player progress.");
  }

  return progress;
}

export async function saveServerPlayerProgress(progress: PlayerProgress) {
  const response = await fetch(PLAYER_PROGRESS_API_PATH, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      progress
    })
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(
      getResponseErrorMessage(
        payload,
        `Unable to save player progress (${response.status}).`
      )
    );
  }

  const savedProgress = parsePlayerProgress(
    (payload as SavePlayerProgressResponse | null)?.progress
  );

  if (!savedProgress) {
    throw new Error("Backend returned invalid player progress.");
  }

  return {
    progress: savedProgress,
    saved: Boolean((payload as SavePlayerProgressResponse | null)?.saved)
  };
}

export async function loadPlayerProgressForReader(
  storageKey: string
): Promise<PlayerProgressLoadResult> {
  const localProgress = readCachedPlayerProgress(storageKey);
  let serverProgress: PlayerProgress | null = null;

  try {
    serverProgress = await fetchServerPlayerProgress();
  } catch (error) {
    return {
      progress: localProgress,
      warning:
        error instanceof Error
          ? error.message
          : "Unable to load backend progress."
    };
  }

  const resolved = resolvePlayerProgressConflict({
    localProgress,
    serverProgress
  });

  persistCachedPlayerProgress(storageKey, resolved.progress);

  return {
    progress: resolved.progress,
    warning: null
  };
}
