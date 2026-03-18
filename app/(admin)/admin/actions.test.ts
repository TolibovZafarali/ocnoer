import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminSessionMock = vi.fn();
const createChapterMock = vi.fn();
const deleteCharacterMock = vi.fn();
const getAdminStoryDataMock = vi.fn();
const reorderDialogueEntryMock = vi.fn();
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

vi.mock("@/lib/story/repository", () => ({
  StoryRepositoryError: class StoryRepositoryError extends Error {},
  addCharacterEmotion: vi.fn(),
  createBackgroundImageAsset: vi.fn(),
  createBackgroundMusicTrack: vi.fn(),
  createChapter: createChapterMock,
  createCharacter: vi.fn(),
  createDialogueEntry: vi.fn(),
  createScene: vi.fn(),
  deleteBackgroundImageAsset: vi.fn(),
  deleteBackgroundMusicTrack: vi.fn(),
  deleteChapter: vi.fn(),
  deleteCharacter: deleteCharacterMock,
  deleteCharacterEmotion: vi.fn(),
  deleteDialogueEntry: vi.fn(),
  deleteScene: vi.fn(),
  getAdminStoryData: getAdminStoryDataMock,
  reorderDialogueEntry: reorderDialogueEntryMock,
  setDefaultCharacterEmotion: vi.fn(),
  updateBackgroundImageAsset: vi.fn(),
  updateBackgroundMusicTrack: vi.fn(),
  updateChapter: vi.fn(),
  updateCharacter: vi.fn(),
  updateCharacterEmotion: vi.fn(),
  updateDialogueEntry: vi.fn(),
  updateScene: vi.fn()
}));

const {
  createChapterAction,
  deleteCharacterAction,
  reorderDialogueEntryAction
} = await import("@/app/(admin)/admin/actions");

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
      orderIndex: 6
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/chapters");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/chapters/chapter_123/scenes?status=success&message=Chapter+created."
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
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/characters?status=success&message=Character+deleted."
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/characters?status=success&message=Character+deleted."
    );
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
