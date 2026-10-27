import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {
    SourceCode: {
      scriptURL: "http://localhost:8081/index.bundle?platform=ios"
    }
  }
}));

vi.mock("../api/playerProgressClient", () => ({
  createPlayerProgressClient: vi.fn()
}));

vi.mock("../storage/playerProgressStorage", () => ({
  clearProgressByPlayerId: vi.fn(),
  loadProgressByPlayerId: vi.fn(),
  saveProgressByPlayerId: vi.fn()
}));

import type { PlayerProgress } from "@ocnoer/story-core";

import {
  MobileApiError,
  MOBILE_API_CONNECTION_ERROR_MESSAGE
} from "../api/mobileApiClient";
import { createPlayerProgressClient } from "../api/playerProgressClient";
import {
  clearProgressByPlayerId,
  loadProgressByPlayerId,
  saveProgressByPlayerId
} from "../storage/playerProgressStorage";
import {
  clearSyncedPlayerProgress,
  loadSyncedPlayerProgress,
  saveSyncedPlayerProgress
} from "./playerProgressSync";

const progress: PlayerProgress = {
  schemaVersion: 1,
  chapterId: "chapter_one",
  sceneId: "scene_one",
  dialogueEntryId: "line_one",
  branchFlags: {},
  updatedAt: "2026-05-06T00:00:00.000Z"
};

const createPlayerProgressClientMock = vi.mocked(createPlayerProgressClient);
const saveProgressByPlayerIdMock = vi.mocked(saveProgressByPlayerId);

describe("saveSyncedPlayerProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", "remote");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps transient backend failures out of reader UI after local save", async () => {
    const saveProgress = vi.fn().mockRejectedValue(
      new MobileApiError(MOBILE_API_CONNECTION_ERROR_MESSAGE, 0, {
        isTransient: true,
        technicalMessage: "Network request failed"
      })
    );

    createPlayerProgressClientMock.mockReturnValue({
      clearProgress: vi.fn(),
      getProgress: vi.fn(),
      saveProgress
    });

    await expect(
      saveSyncedPlayerProgress({
        playerId: "player_one",
        token: "token",
        progress
      })
    ).resolves.toEqual({
      warning: null
    });
    expect(saveProgressByPlayerIdMock).toHaveBeenCalledWith(
      "player_one",
      progress
    );
  });

  it("still surfaces non-transient backend progress errors", async () => {
    createPlayerProgressClientMock.mockReturnValue({
      clearProgress: vi.fn(),
      getProgress: vi.fn(),
      saveProgress: vi.fn().mockRejectedValue(new Error("Invalid progress."))
    });

    await expect(
      saveSyncedPlayerProgress({
        playerId: "player_one",
        token: "token",
        progress
      })
    ).resolves.toEqual({
      warning: "Invalid progress."
    });
  });
});

describe("offline player progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads saved device progress without creating an API client", async () => {
    vi.mocked(loadProgressByPlayerId).mockResolvedValue(progress);

    await expect(
      loadSyncedPlayerProgress({ playerId: "offline-reader", token: "local" })
    ).resolves.toEqual({
      progress,
      source: "local-cache",
      warning: null
    });
    expect(loadProgressByPlayerId).toHaveBeenCalledWith("offline-reader");
    expect(createPlayerProgressClient).not.toHaveBeenCalled();
  });

  it("starts cleanly when no device progress has been saved", async () => {
    vi.mocked(loadProgressByPlayerId).mockResolvedValue(null);

    await expect(
      loadSyncedPlayerProgress({ playerId: "offline-reader", token: "local" })
    ).resolves.toEqual({ progress: null, source: "none", warning: null });
    expect(createPlayerProgressClient).not.toHaveBeenCalled();
  });

  it("saves and resets progress locally without creating an API client", async () => {
    await expect(
      saveSyncedPlayerProgress({
        playerId: "offline-reader",
        token: "local",
        progress
      })
    ).resolves.toEqual({ warning: null });
    await clearSyncedPlayerProgress({
      playerId: "offline-reader",
      token: "local"
    });

    expect(saveProgressByPlayerId).toHaveBeenCalledWith(
      "offline-reader",
      progress
    );
    expect(clearProgressByPlayerId).toHaveBeenCalledWith("offline-reader");
    expect(createPlayerProgressClient).not.toHaveBeenCalled();
  });
});
