import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    playerReadingProgress: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      deleteMany: deleteManyMock
    }
  }
}));

const {
  PlayerProgressError,
  clearPlayerProgress,
  getPlayerProgress,
  parsePlayerProgressRequestPayload,
  savePlayerProgress
} = await import("@/lib/player-progress");

function createProgress(updatedAt: string) {
  return {
    schemaVersion: 1 as const,
    chapterId: "chapter_1",
    sceneId: "scene_1",
    dialogueEntryId: "entry_1",
    branchFlags: {
      cat_name: "Nox"
    },
    updatedAt
  };
}

function createRecord(updatedAt: string) {
  const progress = createProgress(updatedAt);

  return {
    id: "progress_1",
    playerId: "player_1",
    schemaVersion: progress.schemaVersion,
    chapterId: progress.chapterId,
    sceneId: progress.sceneId,
    dialogueEntryId: progress.dialogueEntryId,
    branchFlags: progress.branchFlags,
    progressUpdatedAt: new Date(progress.updatedAt),
    createdAt: new Date("2026-04-24T11:00:00.000Z"),
    updatedAt: new Date("2026-04-24T11:00:00.000Z")
  };
}

describe("player progress service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid request payloads", () => {
    expect(() =>
      parsePlayerProgressRequestPayload({
        progress: {
          chapterId: "chapter_1"
        }
      })
    ).toThrow(PlayerProgressError);
  });

  it("returns stored progress in story-core format", async () => {
    findUniqueMock.mockResolvedValueOnce(
      createRecord("2026-04-24T12:00:00.000Z")
    );

    await expect(getPlayerProgress("player_1")).resolves.toEqual(
      createProgress("2026-04-24T12:00:00.000Z")
    );
  });

  it("does not overwrite newer backend progress with stale progress", async () => {
    findUniqueMock.mockResolvedValueOnce(
      createRecord("2026-04-24T12:00:00.000Z")
    );

    await expect(
      savePlayerProgress({
        playerId: "player_1",
        progress: createProgress("2026-04-24T11:59:00.000Z")
      })
    ).resolves.toEqual({
      progress: createProgress("2026-04-24T12:00:00.000Z"),
      saved: false
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts progress when the submitted progress is newest", async () => {
    const progress = createProgress("2026-04-24T12:01:00.000Z");

    findUniqueMock.mockResolvedValueOnce(
      createRecord("2026-04-24T12:00:00.000Z")
    );
    upsertMock.mockResolvedValueOnce(createRecord(progress.updatedAt));

    await expect(
      savePlayerProgress({
        playerId: "player_1",
        progress
      })
    ).resolves.toEqual({
      progress,
      saved: true
    });
    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        playerId: "player_1"
      },
      create: {
        playerId: "player_1",
        schemaVersion: 1,
        chapterId: "chapter_1",
        sceneId: "scene_1",
        dialogueEntryId: "entry_1",
        branchFlags: {
          cat_name: "Nox"
        },
        progressUpdatedAt: new Date(progress.updatedAt)
      },
      update: {
        schemaVersion: 1,
        chapterId: "chapter_1",
        sceneId: "scene_1",
        dialogueEntryId: "entry_1",
        branchFlags: {
          cat_name: "Nox"
        },
        progressUpdatedAt: new Date(progress.updatedAt)
      }
    });
  });

  it("clears progress by player id", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 1 });

    await clearPlayerProgress("player_1");

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        playerId: "player_1"
      }
    });
  });
});
