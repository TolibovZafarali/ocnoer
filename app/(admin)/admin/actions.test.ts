import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminSessionMock = vi.fn();
const createChapterMock = vi.fn();
const createCharacterMock = vi.fn();
const createDialogueEntryMock = vi.fn();
const deleteCharacterMock = vi.fn();
const deletePlayerProfileMock = vi.fn();
const discardSceneDraftMock = vi.fn();
const getAdminStoryDataMock = vi.fn();
const isSceneDraftStorageUnavailableErrorMock = vi.fn();
const reorderDialogueEntryMock = vi.fn();
const saveSceneDraftMock = vi.fn();
const upsertSceneDraftMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const unstableRethrowMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  unstable_rethrow: unstableRethrowMock
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: requireAdminSessionMock
}));

vi.mock("@/lib/player-profiles", () => ({
  PlayerProfileError: class PlayerProfileError extends Error {},
  createPlayerProfile: vi.fn(),
  deletePlayerProfile: deletePlayerProfileMock,
  updatePlayerProfile: vi.fn(),
  updatePlayerProfileStatus: vi.fn()
}));

vi.mock("@/lib/story/repository", () => ({
  StoryRepositoryError: class StoryRepositoryError extends Error {},
  addCharacterEmotion: vi.fn(),
  createBackgroundImageAsset: vi.fn(),
  createBackgroundMusicTrack: vi.fn(),
  createChapter: createChapterMock,
  createCharacter: createCharacterMock,
  createDialogueEntry: createDialogueEntryMock,
  createScene: vi.fn(),
  discardSceneDraft: discardSceneDraftMock,
  deleteBackgroundImageAsset: vi.fn(),
  deleteBackgroundMusicTrack: vi.fn(),
  deleteChapter: vi.fn(),
  deleteCharacter: deleteCharacterMock,
  deleteCharacterEmotion: vi.fn(),
  deleteDialogueEntry: vi.fn(),
  deleteScene: vi.fn(),
  getAdminStoryData: getAdminStoryDataMock,
  isSceneDraftStorageUnavailableError: isSceneDraftStorageUnavailableErrorMock,
  reorderDialogueEntry: reorderDialogueEntryMock,
  saveSceneDraft: saveSceneDraftMock,
  setDefaultCharacterEmotion: vi.fn(),
  upsertSceneDraft: upsertSceneDraftMock,
  updateBackgroundImageAsset: vi.fn(),
  updateBackgroundMusicTrack: vi.fn(),
  updateChapter: vi.fn(),
  updateCharacter: vi.fn(),
  updateCharacterEmotion: vi.fn(),
  updateDialogueEntry: vi.fn(),
  updateScene: vi.fn()
}));

const {
  createCharacterNavigationAction,
  createChapterNavigationAction,
  createChapterAction,
  createDialogueEntryAction,
  deleteCharacterAction,
  deletePlayerProfileAction,
  discardSceneDraftAction,
  reorderDialogueEntryAction,
  saveSceneDraftAction,
  upsertSceneDraftAction
} = await import("@/app/(admin)/admin/actions");

const sceneDraftPayload = {
  scene: {
    title: "Scene One",
    orderIndex: 1,
    backgroundImageAssetId: "bg_1",
    backgroundMusicAssetId: null,
    backgroundMusicCues: [],
    carryOcnoerDressSelection: true,
    characterIds: ["character_1"]
  },
  dialogue: [
    {
      id: "dialogue_1",
      speakerType: "narrator" as const,
      characterId: null,
      emotionKey: null,
      text: "A line"
    }
  ]
};

describe("createChapterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    createChapterMock.mockResolvedValue({ id: "chapter_123" });
    getAdminStoryDataMock.mockResolvedValue({
      chapters: [
        { id: "chapter_1", orderIndex: 2 },
        { id: "chapter_2", orderIndex: 5 }
      ]
    });
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("derives slug and next order, then redirects to the new chapter scenes page", async () => {
    const formData = new FormData();
    formData.set("returnTo", "/admin/chapters");
    formData.set("title", "Chapter One");

    await expect(createChapterAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/chapters/chapter_123/scenes?status=success&message=Chapter+created."
    );

    expect(createChapterMock).toHaveBeenCalledWith({
      title: "Chapter One",
      slug: "Chapter One",
      orderIndex: 6,
      openingCardText: null,
      endingCardText: null
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/chapters");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes"
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes?status=success&message=Chapter+created."
    );
  });
});

describe("deleteCharacterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    deleteCharacterMock.mockResolvedValue(undefined);
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("always redirects successful deletes to the character index", async () => {
    const formData = new FormData();
    formData.set("characterId", "character_123");
    formData.set("returnTo", "/admin/characters/character_123");

    await expect(deleteCharacterAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/characters?status=success&message=Character+deleted."
    );

    expect(deleteCharacterMock).toHaveBeenCalledWith("character_123");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/characters/character_123"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/characters");
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/characters?status=success&message=Character+deleted."
    );
  });
});

describe("deletePlayerProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    deletePlayerProfileMock.mockResolvedValue(undefined);
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("requires an admin session before deleting", async () => {
    requireAdminSessionMock.mockRejectedValueOnce(new Error("unauthorized"));

    const formData = new FormData();
    formData.set("playerId", "player_123");
    formData.set("confirmDelete", "yes");

    await expect(deletePlayerProfileAction(formData)).rejects.toThrow(
      "unauthorized"
    );

    expect(deletePlayerProfileMock).not.toHaveBeenCalled();
  });

  it("deletes a player and redirects to the player index", async () => {
    const formData = new FormData();
    formData.set("playerId", "player_123");
    formData.set("returnTo", "/admin/players");
    formData.set("confirmDelete", "yes");

    await expect(deletePlayerProfileAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/players?status=success&message=Player+deleted."
    );

    expect(deletePlayerProfileMock).toHaveBeenCalledWith("player_123");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/players");
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/players?status=success&message=Player+deleted."
    );
  });

  it("redirects with an error when deletion is not confirmed", async () => {
    const formData = new FormData();
    formData.set("playerId", "player_123");
    formData.set("returnTo", "/admin/players");

    await expect(deletePlayerProfileAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/players?status=error&message=Confirm+deletion+before+deleting+this+player."
    );

    expect(deletePlayerProfileMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/players?status=error&message=Confirm+deletion+before+deleting+this+player."
    );
  });
});

describe("createCharacterNavigationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    createCharacterMock.mockResolvedValue({ id: "character_123" });
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("returns the new character URL so the client can hard-navigate after submit", async () => {
    const formData = new FormData();
    formData.set("returnTo", "/admin/characters");
    formData.set("name", "Ocnoer");
    formData.set("initialEmotionKey", "default");
    formData.set("initialEmotionLabel", "Default");
    formData.set(
      "imageFile",
      new File(["image"], "ocnoer.png", { type: "image/png" })
    );

    await expect(
      createCharacterNavigationAction(
        { error: null, redirectTo: null },
        formData
      )
    ).resolves.toEqual({
      error: null,
      redirectTo:
        "/admin/characters/character_123?status=success&message=Character+created."
    });

    expect(createCharacterMock).toHaveBeenCalledWith({
      name: "Ocnoer",
      slug: "Ocnoer",
      bio: null,
      initialEmotionKey: "default",
      initialEmotionLabel: "Default",
      imageFile: expect.any(File)
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/characters");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/characters/character_123"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("createChapterNavigationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    createChapterMock.mockResolvedValue({ id: "chapter_123" });
    getAdminStoryDataMock.mockResolvedValue({
      chapters: [
        { id: "chapter_1", orderIndex: 2 },
        { id: "chapter_2", orderIndex: 5 }
      ]
    });
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("returns the new chapter URL so the client can hard-navigate after submit", async () => {
    const formData = new FormData();
    formData.set("returnTo", "/admin/chapters");
    formData.set("title", "Chapter One");

    await expect(
      createChapterNavigationAction({ error: null, redirectTo: null }, formData)
    ).resolves.toEqual({
      error: null,
      redirectTo:
        "/admin/chapters/chapter_123/scenes?status=success&message=Chapter+created."
    });

    expect(createChapterMock).toHaveBeenCalledWith({
      title: "Chapter One",
      slug: "Chapter One",
      orderIndex: 6,
      openingCardText: null,
      endingCardText: null
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/chapters");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("reorderDialogueEntryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    reorderDialogueEntryMock.mockResolvedValue({ id: "dialogue_456" });
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("reorders within the scene and revalidates the server-rendered page", async () => {
    const formData = new FormData();
    formData.set("chapterId", "chapter_123");
    formData.set("sceneId", "scene_456");
    formData.set("dialogueEntryId", "dialogue_789");
    formData.set("targetOrderIndex", "2");

    await expect(reorderDialogueEntryAction(formData)).resolves.toEqual({
      ok: true
    });

    expect(reorderDialogueEntryMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      dialogueEntryId: "dialogue_789",
      targetOrderIndex: 2
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/play");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes/scene_456"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("createDialogueEntryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    createDialogueEntryMock.mockResolvedValue({ id: "dialogue_123" });
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("creates dialogue without a pre-read and lets the repository derive order", async () => {
    const formData = new FormData();
    formData.set("chapterId", "chapter_123");
    formData.set("sceneId", "scene_456");
    formData.set("returnTo", "/admin/chapters/chapter_123/scenes/scene_456");
    formData.set("speakerType", "narrator");
    formData.set("characterId", "");
    formData.set("emotionKey", "");
    formData.set("text", "A new line");

    await expect(createDialogueEntryAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/chapters/chapter_123/scenes/scene_456?status=success&message=Dialogue+entry+created."
    );

    expect(createDialogueEntryMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      speakerType: "narrator",
      characterId: null,
      emotionKey: null,
      dressOptionKeys: [],
      text: "A new line"
    });
    expect(getAdminStoryDataMock).not.toHaveBeenCalled();
  });

  it("allows empty dialogue text for cat-name prompts", async () => {
    const formData = new FormData();
    formData.set("chapterId", "chapter_123");
    formData.set("sceneId", "scene_456");
    formData.set("returnTo", "/admin/chapters/chapter_123/scenes/scene_456");
    formData.set("speakerType", "cat_name_prompt");
    formData.set("characterId", "character_1");
    formData.set("emotionKey", "");
    formData.set("text", "   ");

    await expect(createDialogueEntryAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/chapters/chapter_123/scenes/scene_456?status=success&message=Dialogue+entry+created."
    );

    expect(createDialogueEntryMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      speakerType: "cat_name_prompt",
      characterId: "character_1",
      emotionKey: null,
      dressOptionKeys: [],
      text: ""
    });
  });
});

describe("scene draft actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(undefined);
    upsertSceneDraftMock.mockResolvedValue(undefined);
    saveSceneDraftMock.mockResolvedValue(undefined);
    discardSceneDraftMock.mockResolvedValue(undefined);
    isSceneDraftStorageUnavailableErrorMock.mockReturnValue(false);
    unstableRethrowMock.mockImplementation(() => {});
  });

  it("upserts a scene draft without triggering route revalidation", async () => {
    await expect(
      upsertSceneDraftAction({
        chapterId: "chapter_123",
        sceneId: "scene_456",
        sourceSceneUpdatedAt: "2026-03-19T12:00:00.000Z",
        payload: sceneDraftPayload
      })
    ).resolves.toEqual({
      ok: true
    });

    expect(upsertSceneDraftMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      sourceSceneUpdatedAt: "2026-03-19T12:00:00.000Z",
      payload: sceneDraftPayload
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("saves the scene draft, revalidates story paths, and returns a redirect URL", async () => {
    await expect(
      saveSceneDraftAction({
        chapterId: "chapter_123",
        sceneId: "scene_456",
        returnTo: "/admin/chapters/chapter_123/scenes/scene_456",
        sourceSceneUpdatedAt: "2026-03-19T12:00:00.000Z",
        payload: sceneDraftPayload
      })
    ).resolves.toEqual({
      ok: true,
      redirectTo:
        "/admin/chapters/chapter_123/scenes/scene_456?status=success&message=Scene+saved."
    });

    expect(upsertSceneDraftMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      sourceSceneUpdatedAt: "2026-03-19T12:00:00.000Z",
      payload: sceneDraftPayload
    });
    expect(saveSceneDraftMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      payload: sceneDraftPayload
    });
    expect(upsertSceneDraftMock.mock.invocationCallOrder[0]).toBeLessThan(
      saveSceneDraftMock.mock.invocationCallOrder[0]
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/play");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes/scene_456"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes"
    );
  });

  it("continues saving when draft storage is unavailable", async () => {
    upsertSceneDraftMock.mockRejectedValueOnce(new Error("db unavailable"));
    isSceneDraftStorageUnavailableErrorMock.mockReturnValueOnce(true);

    await expect(
      saveSceneDraftAction({
        chapterId: "chapter_123",
        sceneId: "scene_456",
        returnTo: "/admin/chapters/chapter_123/scenes/scene_456",
        sourceSceneUpdatedAt: "2026-03-19T12:00:00.000Z",
        payload: sceneDraftPayload
      })
    ).resolves.toEqual({
      ok: true,
      redirectTo:
        "/admin/chapters/chapter_123/scenes/scene_456?status=success&message=Scene+saved."
    });

    expect(isSceneDraftStorageUnavailableErrorMock).toHaveBeenCalled();
    expect(saveSceneDraftMock).toHaveBeenCalledWith({
      chapterId: "chapter_123",
      sceneId: "scene_456",
      payload: sceneDraftPayload
    });
  });

  it("discards the scene draft and returns a success redirect", async () => {
    await expect(
      discardSceneDraftAction({
        sceneId: "scene_456",
        returnTo: "/admin/chapters/chapter_123/scenes/scene_456"
      })
    ).resolves.toEqual({
      ok: true,
      redirectTo:
        "/admin/chapters/chapter_123/scenes/scene_456?status=success&message=Draft+discarded."
    });

    expect(discardSceneDraftMock).toHaveBeenCalledWith("scene_456");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
