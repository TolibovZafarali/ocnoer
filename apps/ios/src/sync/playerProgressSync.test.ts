import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { saveProgressByPlayerId } from "../storage/playerProgressStorage";
import { saveSyncedPlayerProgress } from "./playerProgressSync";

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
