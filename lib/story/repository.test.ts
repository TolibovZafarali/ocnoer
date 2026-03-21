import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCENE_DRAFT_TEMP_ID_PREFIX } from "@/lib/story/scene-draft";
import type { SceneDraftPayload } from "@/lib/story/types";

const storageData = new Map<string, string>();
const adminSceneDraftStore = new Map<
  string,
  {
    sceneId: string;
    chapterId: string;
    sourceSceneUpdatedAt: Date;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }
>();

type StorageDownloadResult = {
  data: {
    text: () => Promise<string>;
  } | null;
  error: {
    statusCode?: number | string;
    message: string;
    code?: string;
  } | null;
};

async function downloadFromStorage(
  objectPath: string
): Promise<StorageDownloadResult> {
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
}

const downloadMock = vi.fn(downloadFromStorage);

const uploadMock = vi.fn(
  async (
    objectPath: string,
    value: Buffer,
    _options?: {
      cacheControl?: string;
      contentType?: string;
      upsert?: boolean;
    }
  ) => {
    storageData.set(objectPath, value.toString("utf8"));

    return {
      error: null
    };
  }
);

const listMock = vi.fn(async () => ({
  data: [],
  error: null
}));

const removeMock = vi.fn(async () => ({
  error: null
}));

const findUniqueSceneDraftMock = vi.fn(
  async ({ where: { sceneId } }: { where: { sceneId: string } }) =>
    adminSceneDraftStore.get(sceneId) ?? null
);

const upsertSceneDraftMock = vi.fn(
  async ({
    where: { sceneId },
    update,
    create
  }: {
    where: { sceneId: string };
    update: {
      chapterId: string;
      sourceSceneUpdatedAt: Date;
      payload: unknown;
    };
    create: {
      sceneId: string;
      chapterId: string;
      sourceSceneUpdatedAt: Date;
      payload: unknown;
    };
  }) => {
    const existing = adminSceneDraftStore.get(sceneId);
    const nextTimestamp = new Date("2026-03-19T12:30:00.000Z");
    const record = existing
      ? {
          ...existing,
          chapterId: update.chapterId,
          sourceSceneUpdatedAt: update.sourceSceneUpdatedAt,
          payload: update.payload,
          updatedAt: nextTimestamp
        }
      : {
          sceneId: create.sceneId,
          chapterId: create.chapterId,
          sourceSceneUpdatedAt: create.sourceSceneUpdatedAt,
          payload: create.payload,
          createdAt: nextTimestamp,
          updatedAt: nextTimestamp
        };

    adminSceneDraftStore.set(sceneId, record);

    return record;
  }
);

const deleteManySceneDraftMock = vi.fn(
  async ({ where: { sceneId } }: { where: { sceneId: string } }) => ({
    count: adminSceneDraftStore.delete(sceneId) ? 1 : 0
  })
);

function createCompiledChapterBundle(chapterId: string) {
  return {
    chapterId,
    path: `runtime/runtime/chapters/${chapterId}.json`,
    bundle: {
      schemaVersion: 1,
      generatedAt: "2026-03-17T00:00:00.000Z",
      chapter: {
        id: chapterId
      },
      nextChapterId: null
    }
  };
}

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
    chapterBundles: input.snapshot.chapters.map((chapter) =>
      createCompiledChapterBundle(chapter.id)
    )
  })
);

const compileRuntimeChapterBundleMock = vi.fn((input: { chapterId: string }) =>
  createCompiledChapterBundle(input.chapterId)
);

vi.mock("@/lib/story/published", () => ({
  compileRuntimeStory: compileRuntimeStoryMock,
  compileRuntimeChapterBundle: compileRuntimeChapterBundleMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSceneDraft: {
      findUnique: findUniqueSceneDraftMock,
      upsert: upsertSceneDraftMock,
      deleteMany: deleteManySceneDraftMock
    }
  }
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

const {
  StoryRepositoryError,
  createCharacter,
  createDialogueEntry,
  deleteDialogueEntry,
  discardSceneDraft,
  getAdminStoryData,
  getSceneDraft,
  reorderDialogueEntry,
  saveSceneDraft,
  updateBackgroundImageAsset,
  updateCharacterEmotion,
  updateDialogueEntry,
  upsertSceneDraft
} = await import("@/lib/story/repository");

function seedAuthoringStorage() {
  storageData.set(
    "authoring/characters.json",
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-03-17T00:00:00.000Z",
      characters: [
        {
          id: "character_1",
          name: "Ocnoer",
          slug: "ocnoer",
          bio: "Lead character.",
          defaultEmotionKey: "neutral",
          emotions: [
            {
              id: "emotion_1",
              key: "neutral",
              label: "Neutral",
              imagePath: "characters/ocnoer-neutral.png",
              createdAt: "2026-03-17T00:00:00.000Z",
              updatedAt: "2026-03-17T00:00:00.000Z"
            },
            {
              id: "emotion_2",
              key: "angry",
              label: "Angry",
              imagePath: "characters/ocnoer-angry.png",
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
  storageData.set(
    "authoring/assets.json",
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-03-17T00:00:00.000Z",
      backgroundImages: [
        {
          id: "bg_1",
          type: "background_image",
          label: "Hallway",
          slug: "hallway",
          altText: "Castle hallway",
          filePath: "backgrounds/hallway.png",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z"
        },
        {
          id: "bg_2",
          type: "background_image",
          label: "Courtyard",
          slug: "courtyard",
          altText: "Castle courtyard",
          filePath: "backgrounds/courtyard.png",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z"
        }
      ],
      backgroundMusicTracks: [
        {
          id: "music_1",
          type: "background_music",
          label: "Tension",
          slug: "tension",
          filePath: "music/tension.mp3",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z"
        }
      ]
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
              characterIds: ["character_1"],
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
                    type: "character",
                    characterId: "character_1",
                    emotionKey: "neutral"
                  },
                  createdAt: "2026-03-17T00:00:00.000Z",
                  updatedAt: "2026-03-17T00:00:00.000Z"
                }
              ],
              createdAt: "2026-03-17T00:00:00.000Z",
              updatedAt: "2026-03-17T00:00:00.000Z"
            },
            {
              id: "scene_2",
              title: "Scene Two",
              orderIndex: 2,
              backgroundImageAssetId: "bg_2",
              backgroundMusicAssetId: null,
              characterIds: [],
              dialogue: [],
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
}

function setStoredSceneDraft(input: {
  sceneId: string;
  chapterId?: string;
  sourceSceneUpdatedAt?: string;
  payload: unknown;
}) {
  adminSceneDraftStore.set(input.sceneId, {
    sceneId: input.sceneId,
    chapterId: input.chapterId ?? "chapter_1",
    sourceSceneUpdatedAt: new Date(
      input.sourceSceneUpdatedAt ?? "2026-03-17T00:00:00.000Z"
    ),
    payload: input.payload,
    createdAt: new Date("2026-03-19T12:00:00.000Z"),
    updatedAt: new Date("2026-03-19T12:00:00.000Z")
  });
}

function getPersistedStory() {
  return JSON.parse(storageData.get("authoring/chapters.json") ?? "null") as {
    chapters: Array<{
      updatedAt: string;
      scenes: Array<{
        id: string;
        title: string;
        orderIndex: number;
        backgroundImageAssetId: string;
        backgroundMusicAssetId: string | null;
        characterIds: string[];
        dialogue: Array<{
          id: string;
          orderIndex: number;
          text: string;
          speaker:
            | {
                type: "narrator";
              }
            | {
                type: "character";
                characterId: string;
                emotionKey: string;
              };
        }>;
        updatedAt: string;
      }>;
    }>;
  };
}

function getPersistedCharacters() {
  return JSON.parse(storageData.get("authoring/characters.json") ?? "null") as {
    characters: Array<{
      id: string;
      emotions: Array<{
        id: string;
        imagePath: string;
      }>;
    }>;
  };
}

function getPersistedAssets() {
  return JSON.parse(storageData.get("authoring/assets.json") ?? "null") as {
    backgroundImages: Array<{
      id: string;
      filePath: string;
    }>;
  };
}

function getPersistedScene(sceneId = "scene_1") {
  return (
    getPersistedStory().chapters[0]?.scenes.find(
      (scene) => scene.id === sceneId
    ) ?? null
  );
}

function getPersistedDialogue() {
  return getPersistedScene("scene_1")?.dialogue ?? [];
}

function getUploadPaths() {
  return uploadMock.mock.calls.map(([objectPath]) => objectPath);
}

function expectChapterScopedWrites() {
  expect(getUploadPaths()).toEqual([
    "authoring/chapters.json",
    "runtime/chapters/chapter_1.json"
  ]);
  expect(compileRuntimeStoryMock).not.toHaveBeenCalled();
  expect(compileRuntimeChapterBundleMock).toHaveBeenCalledWith({
    snapshot: expect.objectContaining({
      chapters: expect.arrayContaining([
        expect.objectContaining({ id: "chapter_1" })
      ])
    }),
    chapterId: "chapter_1",
    bucket: "runtime",
    runtimePrefix: "runtime"
  });
  expect(listMock).not.toHaveBeenCalled();
  expect(removeMock).not.toHaveBeenCalled();
}

function createDraftPayload(
  overrides?: Partial<SceneDraftPayload>
): SceneDraftPayload {
  return {
    scene: {
      title: "Scene One Revised",
      orderIndex: 2,
      backgroundImageAssetId: "bg_2",
      backgroundMusicAssetId: "music_1",
      characterIds: ["character_1"],
      ...overrides?.scene
    },
    dialogue: overrides?.dialogue ?? [
      {
        id: "dialogue_3",
        speakerType: "character",
        characterId: "character_1",
        emotionKey: "angry",
        text: "Third revised"
      },
      {
        id: "dialogue_1",
        speakerType: "narrator",
        characterId: null,
        emotionKey: null,
        text: "First revised"
      },
      {
        id: `${SCENE_DRAFT_TEMP_ID_PREFIX}new-entry`,
        speakerType: "character",
        characterId: "character_1",
        emotionKey: "neutral",
        text: "Fresh line"
      }
    ]
  };
}

describe("authoring snapshot loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    adminSceneDraftStore.clear();
    seedAuthoringStorage();
  });

  afterEach(() => {
    downloadMock.mockImplementation(downloadFromStorage);
  });

  it("retries transient storage fetch failures before returning story data", async () => {
    const attemptsByPath = new Map<string, number>();

    downloadMock.mockImplementation(async (objectPath: string) => {
      const attempts = (attemptsByPath.get(objectPath) ?? 0) + 1;
      attemptsByPath.set(objectPath, attempts);

      if (attempts < 3) {
        return {
          data: null,
          error: {
            code: "fetch_error",
            message: "fetch failed"
          }
        };
      }

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

    const story = await getAdminStoryData();

    expect(story.characters).toHaveLength(1);
    expect(story.backgroundImages).toHaveLength(2);
    expect(story.chapters).toHaveLength(1);
    expect(attemptsByPath.get("authoring/characters.json")).toBe(3);
    expect(attemptsByPath.get("authoring/assets.json")).toBe(3);
    expect(attemptsByPath.get("authoring/chapters.json")).toBe(3);
  });

  it("throws a repository error after repeated storage fetch failures", async () => {
    downloadMock.mockImplementation(async () => ({
      data: null,
      error: {
        code: "fetch_error",
        message: "fetch failed"
      }
    }));

    await expect(getAdminStoryData()).rejects.toMatchObject({
      message:
        "Unable to reach Supabase storage while loading authoring data. Check your Supabase URL, network connection, and Supabase project availability."
    });
  });

  it("loads local chapter fallback data in development when storage is unreachable", async () => {
    downloadMock.mockImplementation(async () => ({
      data: null,
      error: {
        code: "fetch_error",
        message: "fetch failed"
      }
    }));

    const fallbackDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ocnoer-authoring-fallback-")
    );
    const mutableEnv = process.env as Record<string, string | undefined>;
    const previousFallbackDirectory = process.env.LOCAL_AUTHORING_FALLBACK_DIR;
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      mutableEnv.NODE_ENV = "development";
      mutableEnv.LOCAL_AUTHORING_FALLBACK_DIR = fallbackDirectory;

      await writeFile(
        path.join(fallbackDirectory, "authoring_chapters.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            updatedAt: "2026-03-20T05:00:00.000Z",
            chapters: [
              {
                id: "chapter_local_1",
                title: "Local Chapter",
                slug: "local-chapter",
                orderIndex: 1,
                scenes: [
                  {
                    id: "scene_local_1",
                    title: "Local Scene",
                    orderIndex: 1,
                    backgroundImageAssetId: "bg_local_1",
                    backgroundMusicAssetId: "music_local_1",
                    characterIds: ["character_local_1"],
                    dialogue: [
                      {
                        id: "dialogue_local_1",
                        orderIndex: 1,
                        text: "Fallback line",
                        speaker: {
                          type: "character",
                          characterId: "character_local_1",
                          emotionKey: "sad"
                        },
                        createdAt: "2026-03-20T05:00:00.000Z",
                        updatedAt: "2026-03-20T05:00:00.000Z"
                      }
                    ],
                    createdAt: "2026-03-20T05:00:00.000Z",
                    updatedAt: "2026-03-20T05:00:00.000Z"
                  }
                ],
                createdAt: "2026-03-20T05:00:00.000Z",
                updatedAt: "2026-03-20T05:00:00.000Z"
              }
            ]
          },
          null,
          2
        ),
        "utf8"
      );

      await writeFile(
        path.join(fallbackDirectory, "chapter_local_1.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            generatedAt: "2026-03-20T05:00:00.000Z",
            chapter: {
              id: "chapter_local_1",
              title: "Local Chapter",
              slug: "local-chapter",
              orderIndex: 1,
              scenes: [
                {
                  id: "scene_local_1",
                  title: "Local Scene",
                  orderIndex: 1,
                  backgroundImage: {
                    id: "bg_local_1",
                    label: "Local Hall",
                    slug: "local-hall",
                    altText: "Local hall",
                    filePath: "runtime/media/background-images/bg_local_1"
                  },
                  backgroundMusic: {
                    id: "music_local_1",
                    label: "Storm Theme",
                    slug: "storm-theme",
                    filePath: "runtime/media/background-music/music_local_1"
                  },
                  characterPool: [
                    {
                      id: "character_local_1",
                      name: "Ocnoer",
                      slug: "ocnoer",
                      bio: null,
                      defaultEmotionKey: "default",
                      defaultEmotionImagePath:
                        "runtime/media/characters/character_local_1/default",
                      emotions: [
                        {
                          key: "default",
                          label: "Default",
                          imagePath:
                            "runtime/media/characters/character_local_1/default"
                        },
                        {
                          key: "sad",
                          label: "Sad",
                          imagePath:
                            "runtime/media/characters/character_local_1/sad"
                        }
                      ],
                      dresses: []
                    }
                  ],
                  dialogue: [
                    {
                      id: "dialogue_local_1",
                      orderIndex: 1,
                      text: "Fallback line",
                      speaker: {
                        type: "character",
                        characterId: "character_local_1",
                        characterName: "Ocnoer",
                        characterSlug: "ocnoer",
                        emotionKey: "sad",
                        emotionLabel: "Sad",
                        emotionImagePath:
                          "runtime/media/characters/character_local_1/sad"
                      },
                      stage: {
                        left: null,
                        right: null
                      }
                    }
                  ]
                }
              ]
            },
            nextChapterId: null
          },
          null,
          2
        ),
        "utf8"
      );

      const story = await getAdminStoryData();

      expect(story.chapters).toHaveLength(1);
      expect(story.chapters[0]?.id).toBe("chapter_local_1");
      expect(story.backgroundImages).toEqual([
        expect.objectContaining({
          id: "bg_local_1",
          label: "Local Hall"
        })
      ]);
      expect(story.backgroundMusicTracks).toEqual([
        expect.objectContaining({
          id: "music_local_1",
          label: "Storm Theme"
        })
      ]);
      expect(story.characters).toEqual([
        expect.objectContaining({
          id: "character_local_1",
          defaultEmotionKey: "default",
          emotions: expect.arrayContaining([
            expect.objectContaining({
              key: "default"
            }),
            expect.objectContaining({
              key: "sad"
            })
          ])
        })
      ]);
    } finally {
      if (previousFallbackDirectory == null) {
        delete mutableEnv.LOCAL_AUTHORING_FALLBACK_DIR;
      } else {
        mutableEnv.LOCAL_AUTHORING_FALLBACK_DIR = previousFallbackDirectory;
      }

      if (previousNodeEnv == null) {
        delete mutableEnv.NODE_ENV;
      } else {
        mutableEnv.NODE_ENV = previousNodeEnv;
      }

      await rm(fallbackDirectory, {
        recursive: true,
        force: true
      });
    }
  });
});

describe("dialogue mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    adminSceneDraftStore.clear();
    seedAuthoringStorage();
  });

  it("creates a dialogue entry by appending within the same snapshot read", async () => {
    const entry = await createDialogueEntry({
      chapterId: "chapter_1",
      sceneId: "scene_1",
      speakerType: "narrator",
      characterId: null,
      emotionKey: null,
      text: "Fourth"
    });

    expect(entry.orderIndex).toBe(10);
    expect(
      getPersistedDialogue().map((dialogue) => dialogue.orderIndex)
    ).toEqual([1, 4, 9, 10]);
    expect(
      downloadMock.mock.calls.filter(
        ([objectPath]) => objectPath === "authoring/chapters.json"
      )
    ).toHaveLength(1);
    expectChapterScopedWrites();
  });

  it("updates a dialogue entry without rewriting unrelated runtime artifacts", async () => {
    await updateDialogueEntry({
      chapterId: "chapter_1",
      sceneId: "scene_1",
      dialogueEntryId: "dialogue_2",
      orderIndex: 4,
      speakerType: "narrator",
      characterId: null,
      emotionKey: null,
      text: "Second draft"
    });

    expect(
      getPersistedDialogue().find((dialogue) => dialogue.id === "dialogue_2")
    ).toMatchObject({
      id: "dialogue_2",
      orderIndex: 4,
      text: "Second draft"
    });
    expectChapterScopedWrites();
  });

  it("moves a dialogue entry within a scene and normalizes order indices contiguously", async () => {
    const entry = await reorderDialogueEntry({
      chapterId: "chapter_1",
      sceneId: "scene_1",
      dialogueEntryId: "dialogue_3",
      targetOrderIndex: 1
    });

    expect(entry.orderIndex).toBe(1);
    expect(
      getPersistedDialogue().map((dialogue) => ({
        id: dialogue.id,
        orderIndex: dialogue.orderIndex
      }))
    ).toEqual([
      { id: "dialogue_3", orderIndex: 1 },
      { id: "dialogue_1", orderIndex: 2 },
      { id: "dialogue_2", orderIndex: 3 }
    ]);
    expectChapterScopedWrites();
  });

  it("deletes a dialogue entry without touching manifest or asset files", async () => {
    await deleteDialogueEntry({
      chapterId: "chapter_1",
      sceneId: "scene_1",
      dialogueEntryId: "dialogue_2"
    });

    expect(getPersistedDialogue().map((dialogue) => dialogue.id)).toEqual([
      "dialogue_1",
      "dialogue_3"
    ]);
    expectChapterScopedWrites();
  });
});

describe("scene draft persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    adminSceneDraftStore.clear();
    seedAuthoringStorage();
  });

  it("upserts and reloads a scene draft payload", async () => {
    const payload = createDraftPayload({
      scene: {
        title: "Draft Scene",
        orderIndex: 1,
        backgroundImageAssetId: "bg_1",
        backgroundMusicAssetId: null,
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_1",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          text: "Draft line"
        }
      ]
    });

    await upsertSceneDraft({
      sceneId: "scene_1",
      chapterId: "chapter_1",
      sourceSceneUpdatedAt: "2026-03-17T00:00:00.000Z",
      payload
    });

    await expect(getSceneDraft("scene_1")).resolves.toMatchObject({
      sceneId: "scene_1",
      chapterId: "chapter_1",
      sourceSceneUpdatedAt: "2026-03-17T00:00:00.000Z",
      payload
    });
  });

  it("drops invalid persisted draft payloads during load", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: {
        scene: {
          title: "Broken draft"
        }
      }
    });

    await expect(getSceneDraft("scene_1")).resolves.toBeNull();
    expect(deleteManySceneDraftMock).toHaveBeenCalledWith({
      where: {
        sceneId: "scene_1"
      }
    });
    expect(adminSceneDraftStore.has("scene_1")).toBe(false);
  });

  it("discards a stored draft", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: createDraftPayload()
    });

    await discardSceneDraft("scene_1");

    expect(adminSceneDraftStore.has("scene_1")).toBe(false);
  });
});

describe("saveSceneDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    adminSceneDraftStore.clear();
    seedAuthoringStorage();
  });

  it("saves a whole-scene draft by only writing chapters and the affected chapter bundle", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: createDraftPayload()
    });

    const result = await saveSceneDraft({
      chapterId: "chapter_1",
      sceneId: "scene_1"
    });

    const persistedScene = getPersistedScene("scene_1");

    expect(result.payload.scene).toMatchObject({
      title: "Scene One Revised",
      orderIndex: 2,
      backgroundImageAssetId: "bg_2",
      backgroundMusicAssetId: "music_1",
      characterIds: ["character_1"]
    });
    expect(persistedScene).toMatchObject({
      title: "Scene One Revised",
      orderIndex: 2,
      backgroundImageAssetId: "bg_2",
      backgroundMusicAssetId: "music_1",
      characterIds: ["character_1"]
    });
    expect(getPersistedScene("scene_2")?.orderIndex).toBe(1);
    expect(getPersistedDialogue()).toHaveLength(3);
    expect(getPersistedDialogue().map((entry) => entry.orderIndex)).toEqual([
      1, 2, 3
    ]);
    expect(getPersistedDialogue().map((entry) => entry.id)).not.toContain(
      "dialogue_2"
    );
    expect(getPersistedDialogue()[0]).toMatchObject({
      id: "dialogue_3",
      orderIndex: 1,
      text: "Third revised",
      speaker: {
        type: "character",
        characterId: "character_1",
        emotionKey: "angry"
      }
    });
    expect(getPersistedDialogue()[1]).toMatchObject({
      id: "dialogue_1",
      orderIndex: 2,
      text: "First revised",
      speaker: {
        type: "narrator"
      }
    });
    expect(getPersistedDialogue()[2]?.id).toMatch(/^dialogue_[a-f0-9]+$/i);
    expect(
      getPersistedDialogue()[2]?.id.startsWith(SCENE_DRAFT_TEMP_ID_PREFIX)
    ).toBe(false);
    expect(adminSceneDraftStore.has("scene_1")).toBe(false);
    expectChapterScopedWrites();
  });

  it("keeps the draft row when validation fails for a missing background image", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: createDraftPayload({
        scene: {
          title: "Broken Scene",
          orderIndex: 1,
          backgroundImageAssetId: "bg_missing",
          backgroundMusicAssetId: null,
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_1",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            text: "Still here"
          }
        ]
      })
    });

    await expect(
      saveSceneDraft({
        chapterId: "chapter_1",
        sceneId: "scene_1"
      })
    ).rejects.toThrow("Background image asset not found.");

    expect(adminSceneDraftStore.has("scene_1")).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("keeps the draft row when validation fails for a character outside the scene cast", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: createDraftPayload({
        scene: {
          title: "Broken Scene",
          orderIndex: 1,
          backgroundImageAssetId: "bg_1",
          backgroundMusicAssetId: null,
          characterIds: []
        },
        dialogue: [
          {
            id: "dialogue_3",
            speakerType: "character",
            characterId: "character_1",
            emotionKey: "neutral",
            text: "Cast mismatch"
          }
        ]
      })
    });

    await expect(
      saveSceneDraft({
        chapterId: "chapter_1",
        sceneId: "scene_1"
      })
    ).rejects.toThrow(
      "Dialogue speaker must be selected in the scene character pool."
    );

    expect(adminSceneDraftStore.has("scene_1")).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("keeps the draft row when validation fails for an invalid emotion", async () => {
    setStoredSceneDraft({
      sceneId: "scene_1",
      payload: createDraftPayload({
        scene: {
          title: "Broken Scene",
          orderIndex: 1,
          backgroundImageAssetId: "bg_1",
          backgroundMusicAssetId: null,
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_3",
            speakerType: "character",
            characterId: "character_1",
            emotionKey: "missing",
            text: "Bad emotion"
          }
        ]
      })
    });

    await expect(
      saveSceneDraft({
        chapterId: "chapter_1",
        sceneId: "scene_1"
      })
    ).rejects.toThrow("Selected emotion does not belong to the speaker.");

    expect(adminSceneDraftStore.has("scene_1")).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("non-dialogue commits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageData.clear();
    adminSceneDraftStore.clear();
    seedAuthoringStorage();
  });

  it("writes authoring catalogs without cache so a created character is readable immediately", async () => {
    await createCharacter({
      name: "Ocnoer Prime",
      slug: "ocnoer-prime",
      bio: "Primary point-of-view character.",
      initialEmotionKey: "default",
      initialEmotionLabel: "Default",
      imageFile: new File(["image"], "ocnoer-main.png", {
        type: "image/png"
      })
    });

    const authoringCharactersUpload = uploadMock.mock.calls.find(
      ([objectPath]) => objectPath === "authoring/characters.json"
    );
    const authoringAssetsUpload = uploadMock.mock.calls.find(
      ([objectPath]) => objectPath === "authoring/assets.json"
    );
    const authoringChaptersUpload = uploadMock.mock.calls.find(
      ([objectPath]) => objectPath === "authoring/chapters.json"
    );
    const runtimeManifestUpload = uploadMock.mock.calls.find(
      ([objectPath]) => objectPath === "runtime/manifest.json"
    );

    expect(authoringCharactersUpload?.[2]).toMatchObject({
      cacheControl: "0",
      upsert: true
    });
    expect(authoringAssetsUpload?.[2]).toMatchObject({
      cacheControl: "0",
      upsert: true
    });
    expect(authoringChaptersUpload?.[2]).toMatchObject({
      cacheControl: "0",
      upsert: true
    });
    expect(runtimeManifestUpload?.[2]).toMatchObject({
      cacheControl: "60",
      upsert: true
    });
    expect(compileRuntimeStoryMock).toHaveBeenCalled();
  });

  it("stores replacement emotion images on a new path to avoid stale cache", async () => {
    await updateCharacterEmotion({
      characterId: "character_1",
      emotionId: "emotion_1",
      emotionKey: "neutral",
      emotionLabel: "Neutral",
      imageFile: new File(["new-image"], "ocnoer-neutral-v2.png", {
        type: "image/png"
      })
    });

    const uploadedEmotionPath = getUploadPaths().find((path) =>
      path.startsWith("media/characters/character_1/emotion_1/")
    );

    expect(uploadedEmotionPath).toBeDefined();
    expect(uploadedEmotionPath).not.toBe(
      "media/characters/character_1/emotion_1"
    );
    expect(
      getPersistedCharacters()
        .characters.find((character) => character.id === "character_1")
        ?.emotions.find((emotion) => emotion.id === "emotion_1")?.imagePath
    ).toBe(`runtime/${uploadedEmotionPath}`);
    expect(removeMock).toHaveBeenCalledWith(["characters/ocnoer-neutral.png"]);
    expect(compileRuntimeStoryMock).toHaveBeenCalled();
  });

  it("stores replacement background images on a new path to avoid stale cache", async () => {
    await updateBackgroundImageAsset({
      assetId: "bg_1",
      label: "Hallway",
      slug: "hallway",
      altText: "Castle hallway",
      file: new File(["new-background"], "hallway-v2.png", {
        type: "image/png"
      })
    });

    const uploadedBackgroundPath = getUploadPaths().find((path) =>
      path.startsWith("media/background-images/bg_1/")
    );

    expect(uploadedBackgroundPath).toBeDefined();
    expect(uploadedBackgroundPath).not.toBe("media/background-images/bg_1");
    expect(
      getPersistedAssets().backgroundImages.find((asset) => asset.id === "bg_1")
        ?.filePath
    ).toBe(`runtime/${uploadedBackgroundPath}`);
    expect(removeMock).toHaveBeenCalledWith(["backgrounds/hallway.png"]);
    expect(compileRuntimeStoryMock).toHaveBeenCalled();
  });
});
