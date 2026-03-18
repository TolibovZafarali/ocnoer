import { beforeEach, describe, expect, it, vi } from "vitest";

const storageData = new Map<string, string>();
const downloadMock = vi.fn(async (objectPath: string) => {
  const value = storageData.get(objectPath);

  if (value == null) {
    return {
      data: null,
      error: {
        statusCode: 404,
        message: "Not found"
      }
    };
  }

  return {
    data: {
      text: async () => value
    },
    error: null
  };
});
const uploadMock = vi.fn(async (objectPath: string, value: Buffer) => {
  storageData.set(objectPath, value.toString("utf8"));

  return {
    error: null
  };
});
const listMock = vi.fn(async () => ({
  data: [],
  error: null
}));
const removeMock = vi.fn(async () => ({
  error: null
}));
const compileRuntimeStoryMock = vi.fn(
  (input: {
    snapshot: { chapters: Array<{ id: string }> };
    bucket: string;
    runtimePrefix: string;
  }) => ({
    manifest: {
      schemaVersion: 1,
      generatedAt: "2026-03-17T00:00:00.000Z",
      firstChapterId: input.snapshot.chapters[0]?.id ?? null,
      chaptersPath: `${input.bucket}/${input.runtimePrefix}/manifest.json`,
      charactersPath: `${input.bucket}/${input.runtimePrefix}/characters.json`,
      assetsPath: `${input.bucket}/${input.runtimePrefix}/assets.json`,
      chapters: []
    },
    charactersManifest: {
      schemaVersion: 1,
      generatedAt: "2026-03-17T00:00:00.000Z",
      characters: []
    },
    assetsManifest: {
      schemaVersion: 1,
      generatedAt: "2026-03-17T00:00:00.000Z",
      backgroundImages: [],
      backgroundMusicTracks: []
    },
    chapterBundles: input.snapshot.chapters.map((chapter) => ({
      chapterId: chapter.id,
      path: `${input.bucket}/${input.runtimePrefix}/chapters/${chapter.id}.json`,
      bundle: {
        chapter: {
          id: chapter.id
        }
      }
    }))
  })
);

vi.mock("@/lib/story/published", () => ({
  compileRuntimeStory: compileRuntimeStoryMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabaseClient: () => ({
    storage: {
      from: () => ({
        download: downloadMock,
        upload: uploadMock,
        list: listMock,
        remove: removeMock
      })
    }
  })
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseServerEnv: () => ({
    runtimeBucket: "runtime"
  })
}));

const { reorderDialogueEntry } = await import("@/lib/story/repository");

describe("reorderDialogueEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    storageData.set(
      "authoring/characters.json",
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        characters: []
      })
    );
    storageData.set(
      "authoring/assets.json",
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        backgroundImages: [],
        backgroundMusicTracks: []
      })
    );
    storageData.set(
      "authoring/chapters.json",
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        chapters: [
          {
            id: "chapter_1",
            title: "Chapter One",
            slug: "chapter-one",
            orderIndex: 1,
            scenes: [
              {
                id: "scene_1",
                title: "Scene One",
                orderIndex: 1,
                backgroundImageAssetId: "bg_1",
                backgroundMusicAssetId: null,
                characterIds: [],
                dialogue: [
                  {
                    id: "dialogue_1",
                    orderIndex: 1,
                    text: "First",
                    speaker: {
                      type: "narrator"
                    },
                    createdAt: "2026-03-17T00:00:00.000Z",
                    updatedAt: "2026-03-17T00:00:00.000Z"
                  },
                  {
                    id: "dialogue_2",
                    orderIndex: 4,
                    text: "Second",
                    speaker: {
                      type: "narrator"
                    },
                    createdAt: "2026-03-17T00:00:00.000Z",
                    updatedAt: "2026-03-17T00:00:00.000Z"
                  },
                  {
                    id: "dialogue_3",
                    orderIndex: 9,
                    text: "Third",
                    speaker: {
                      type: "narrator"
                    },
                    createdAt: "2026-03-17T00:00:00.000Z",
                    updatedAt: "2026-03-17T00:00:00.000Z"
                  }
                ],
                createdAt: "2026-03-17T00:00:00.000Z",
                updatedAt: "2026-03-17T00:00:00.000Z"
              }
            ],
            createdAt: "2026-03-17T00:00:00.000Z",
            updatedAt: "2026-03-17T00:00:00.000Z"
          }
        ]
      })
    );
  });

  it("moves a dialogue entry within a scene and normalizes order indices contiguously", async () => {
    const entry = await reorderDialogueEntry({
      chapterId: "chapter_1",
      sceneId: "scene_1",
      dialogueEntryId: "dialogue_3",
      targetOrderIndex: 1
    });

    const persistedChapters = JSON.parse(
      storageData.get("authoring/chapters.json") ?? "null"
    ) as {
      chapters: Array<{
        scenes: Array<{
          dialogue: Array<{
            id: string;
            orderIndex: number;
          }>;
        }>;
      }>;
    };

    expect(entry.orderIndex).toBe(1);
    expect(
      persistedChapters.chapters[0]?.scenes[0]?.dialogue.map((dialogue) => ({
        id: dialogue.id,
        orderIndex: dialogue.orderIndex
      }))
    ).toEqual([
      { id: "dialogue_3", orderIndex: 1 },
      { id: "dialogue_1", orderIndex: 2 },
      { id: "dialogue_2", orderIndex: 3 }
    ]);
    expect(compileRuntimeStoryMock).toHaveBeenCalled();
  });
});
