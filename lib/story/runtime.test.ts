import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerProgress, ReaderState } from "@/lib/story/reader";
import {
  createRuntimeChapterLoader,
  decidePlayerResumeAction,
  getPlayerRuntimeAssetUrls,
  loadPlayerRuntimeBootstrap,
  loadPlayerRuntimeSession
} from "@/lib/story/runtime";
import type {
  RuntimeChapterBundle,
  RuntimeManifest,
  RuntimeScene,
  RuntimeStageCharacter
} from "@/lib/story/types";

function createScene(input: {
  id: string;
  title: string;
  orderIndex: number;
  dialogueIds: string[];
  backgroundImagePath?: string;
  leftImagePath?: string | null;
  rightImagePath?: string | null;
}): RuntimeScene {
  return {
    id: input.id,
    title: input.title,
    orderIndex: input.orderIndex,
    backgroundImage: {
      id: `bg_${input.id}`,
      label: `Background ${input.title}`,
      slug: `background-${input.id}`,
      altText: null,
      filePath:
        input.backgroundImagePath ?? `runtime/media/background-${input.id}.png`
    },
    backgroundMusic: null,
    carryOcnoerDressSelection: true,
    characterPool: [],
    dialogue: input.dialogueIds.map((dialogueId, index) => ({
      id: dialogueId,
      orderIndex: index + 1,
      text: `${dialogueId} text`,
      speaker: {
        type: "narrator"
      },
      stage: {
        left:
          index === 0 && input.leftImagePath
            ? {
                characterId: "character_left",
                characterName: "Left",
                characterSlug: "left",
                emotionKey: "default",
                emotionLabel: "Default",
                imagePath: input.leftImagePath
              }
            : null,
        right:
          index === 0 && input.rightImagePath
            ? {
                characterId: "character_right",
                characterName: "Right",
                characterSlug: "right",
                emotionKey: "default",
                emotionLabel: "Default",
                imagePath: input.rightImagePath
              }
            : null
      }
    }))
  };
}

function createStageCharacter(input: {
  characterId: string;
  characterName: string;
  characterSlug: string;
  imagePath: string;
}): RuntimeStageCharacter {
  return {
    characterId: input.characterId,
    characterName: input.characterName,
    characterSlug: input.characterSlug,
    emotionKey: "default",
    emotionLabel: "Default",
    imagePath: input.imagePath
  };
}

function createBundle(input: {
  chapterId: string;
  title: string;
  orderIndex: number;
  nextChapterId: string | null;
  scenes: RuntimeScene[];
}): RuntimeChapterBundle {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-19T00:00:00.000Z",
    nextChapterId: input.nextChapterId,
    chapter: {
      id: input.chapterId,
      title: input.title,
      slug: input.chapterId.replace(/_/g, "-"),
      orderIndex: input.orderIndex,
      scenes: input.scenes
    }
  };
}

function createManifest(
  chapters: RuntimeManifest["chapters"]
): RuntimeManifest {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-19T00:00:00.000Z",
    firstChapterId: chapters[0]?.id ?? null,
    chaptersPath: "runtime/runtime/manifest.json",
    charactersPath: "runtime/runtime/characters.json",
    assetsPath: "runtime/runtime/assets.json",
    chapters
  };
}

function createFetchMock(records: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const marker = "/storage/v1/object/public/";
    const pathIndex = url.indexOf(marker);
    const storagePath =
      pathIndex >= 0 ? url.slice(pathIndex + marker.length) : url;
    const payload = records[storagePath];

    if (payload == null) {
      return new Response("Not found", {
        status: 404
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  });
}

const supabaseUrl = "https://example.supabase.co";
const initialReaderState: ReaderState = {
  sceneIndex: 0,
  dialogueIndex: 0,
  isChapterComplete: false
};
const laterChapterProgress: PlayerProgress = {
  schemaVersion: 1,
  chapterId: "chapter_two",
  sceneId: "scene_two",
  dialogueEntryId: "line_two",
  branchFlags: {
    visited: true
  },
  updatedAt: "2026-03-19T00:00:00.000Z"
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("loadPlayerRuntimeBootstrap", () => {
  it("returns null bundle/state when the runtime has no playable story", async () => {
    const emptyBundle = createBundle({
      chapterId: "chapter_empty",
      title: "Chapter Empty",
      orderIndex: 1,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_empty",
          title: "Empty Scene",
          orderIndex: 1,
          dialogueIds: []
        })
      ]
    });
    const manifest = createManifest([
      {
        id: "chapter_empty",
        title: "Chapter Empty",
        slug: "chapter-empty",
        orderIndex: 1,
        bundlePath: "runtime/runtime/chapters/chapter_empty.json"
      }
    ]);

    vi.stubGlobal(
      "fetch",
      createFetchMock({
        "runtime/runtime/manifest.json": manifest,
        "runtime/runtime/chapters/chapter_empty.json": emptyBundle
      })
    );

    const bootstrap = await loadPlayerRuntimeBootstrap({
      manifestPath: "runtime/runtime/manifest.json",
      supabaseUrl
    });

    expect(bootstrap.initialManifest).toEqual(manifest);
    expect(bootstrap.initialBundle).toBeNull();
    expect(bootstrap.initialReaderState).toBeNull();
    expect(bootstrap.initialAssetUrls).toEqual({
      backgroundImageUrl: null,
      leftCharacterImageUrl: null,
      rightCharacterImageUrl: null
    });
  });

  it("resolves the first playable chapter when the opening chapter is empty", async () => {
    const emptyBundle = createBundle({
      chapterId: "chapter_one",
      title: "Chapter One",
      orderIndex: 1,
      nextChapterId: "chapter_two",
      scenes: [
        createScene({
          id: "scene_one",
          title: "Scene One",
          orderIndex: 1,
          dialogueIds: []
        })
      ]
    });
    const playableBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          dialogueIds: ["line_two"],
          backgroundImagePath: "runtime/media/opening-background.png",
          leftImagePath: "runtime/media/opening-left.png"
        })
      ]
    });
    const manifest = createManifest([
      {
        id: "chapter_one",
        title: "Chapter One",
        slug: "chapter-one",
        orderIndex: 1,
        bundlePath: "runtime/runtime/chapters/chapter_one.json"
      },
      {
        id: "chapter_two",
        title: "Chapter Two",
        slug: "chapter-two",
        orderIndex: 2,
        bundlePath: "runtime/runtime/chapters/chapter_two.json"
      }
    ]);

    vi.stubGlobal(
      "fetch",
      createFetchMock({
        "runtime/runtime/manifest.json": manifest,
        "runtime/runtime/chapters/chapter_one.json": emptyBundle,
        "runtime/runtime/chapters/chapter_two.json": playableBundle
      })
    );

    const bootstrap = await loadPlayerRuntimeBootstrap({
      manifestPath: "runtime/runtime/manifest.json",
      supabaseUrl
    });

    expect(bootstrap.initialBundle?.chapter.id).toBe("chapter_two");
    expect(bootstrap.initialReaderState).toEqual(initialReaderState);
  });
});

describe("getPlayerRuntimeAssetUrls", () => {
  it("hides stage portraits during narrator entries", () => {
    const playableBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          dialogueIds: ["line_two"],
          backgroundImagePath: "runtime/media/opening-background.png",
          leftImagePath: "runtime/media/opening-left.png"
        })
      ]
    });

    expect(
      getPlayerRuntimeAssetUrls({
        supabaseUrl,
        bundle: playableBundle,
        readerState: initialReaderState
      })
    ).toEqual({
      backgroundImageUrl:
        "https://example.supabase.co/storage/v1/object/public/runtime/media/opening-background.png",
      leftCharacterImageUrl: null,
      rightCharacterImageUrl: null
    });
  });

  it("only returns the currently speaking character portrait", () => {
    const playableBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        {
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          backgroundImage: {
            id: "bg_scene_two",
            label: "Background Scene Two",
            slug: "background-scene-two",
            altText: null,
            filePath: "runtime/media/opening-background.png"
          },
          backgroundMusic: null,
          carryOcnoerDressSelection: true,
          characterPool: [],
          dialogue: [
            {
              id: "line_two",
              orderIndex: 1,
              text: "Are you ready?",
              speaker: {
                type: "character",
                characterId: "character_right",
                characterName: "Right",
                characterSlug: "right",
                emotionKey: "default",
                emotionLabel: "Default",
                emotionImagePath: "runtime/media/opening-right.png"
              },
              stage: {
                left: createStageCharacter({
                  characterId: "character_left",
                  characterName: "Left",
                  characterSlug: "left",
                  imagePath: "runtime/media/opening-left.png"
                }),
                right: createStageCharacter({
                  characterId: "character_right",
                  characterName: "Right",
                  characterSlug: "right",
                  imagePath: "runtime/media/opening-right.png"
                })
              }
            }
          ]
        }
      ]
    });

    expect(
      getPlayerRuntimeAssetUrls({
        supabaseUrl,
        bundle: playableBundle,
        readerState: initialReaderState
      })
    ).toEqual({
      backgroundImageUrl:
        "https://example.supabase.co/storage/v1/object/public/runtime/media/opening-background.png",
      leftCharacterImageUrl: null,
      rightCharacterImageUrl:
        "https://example.supabase.co/storage/v1/object/public/runtime/media/opening-right.png"
    });
  });
});

describe("player runtime session helpers", () => {
  it("reuses a seeded chapter bundle from cache without refetching it", async () => {
    const playableBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          dialogueIds: ["line_two"]
        })
      ]
    });
    const manifest = createManifest([
      {
        id: "chapter_two",
        title: "Chapter Two",
        slug: "chapter-two",
        orderIndex: 1,
        bundlePath: "runtime/runtime/chapters/chapter_two.json"
      }
    ]);
    const fetchMock = createFetchMock({});

    vi.stubGlobal("fetch", fetchMock);

    const loadChapter = createRuntimeChapterLoader({
      supabaseUrl,
      cache: new Map([[playableBundle.chapter.id, playableBundle]])
    });
    const loadedBundle = await loadChapter(manifest, playableBundle.chapter.id);

    expect(loadedBundle).toBe(playableBundle);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resumes from the seeded initial bundle when saved progress is in the same chapter", () => {
    const playableBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          dialogueIds: ["line_two", "line_three"]
        })
      ]
    });

    expect(
      decidePlayerResumeAction({
        initialBundle: playableBundle,
        storedProgress: laterChapterProgress
      })
    ).toEqual({
      type: "resume-from-initial-bundle",
      branchFlags: {
        visited: true
      },
      readerState: {
        sceneIndex: 0,
        dialogueIndex: 0,
        isChapterComplete: false
      }
    });
  });

  it("loads only the requested progress chapter when resume needs a different bundle", async () => {
    const manifest = createManifest([
      {
        id: "chapter_one",
        title: "Chapter One",
        slug: "chapter-one",
        orderIndex: 1,
        bundlePath: "runtime/runtime/chapters/chapter_one.json"
      },
      {
        id: "chapter_two",
        title: "Chapter Two",
        slug: "chapter-two",
        orderIndex: 2,
        bundlePath: "runtime/runtime/chapters/chapter_two.json"
      }
    ]);
    const laterBundle = createBundle({
      chapterId: "chapter_two",
      title: "Chapter Two",
      orderIndex: 2,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_two",
          title: "Scene Two",
          orderIndex: 1,
          dialogueIds: ["line_two"]
        })
      ]
    });
    const fetchMock = createFetchMock({});
    const loadChapter = vi.fn(
      async (_manifest: RuntimeManifest, chapterId: string) => {
        expect(chapterId).toBe("chapter_two");
        return laterBundle;
      }
    );

    vi.stubGlobal("fetch", fetchMock);

    expect(
      decidePlayerResumeAction({
        initialBundle: createBundle({
          chapterId: "chapter_one",
          title: "Chapter One",
          orderIndex: 1,
          nextChapterId: "chapter_two",
          scenes: [
            createScene({
              id: "scene_one",
              title: "Scene One",
              orderIndex: 1,
              dialogueIds: ["line_one"]
            })
          ]
        }),
        storedProgress: laterChapterProgress
      })
    ).toEqual({
      type: "load-from-progress",
      branchFlags: {
        visited: true
      }
    });

    const loadedRuntime = await loadPlayerRuntimeSession({
      manifestPath: "runtime/runtime/manifest.json",
      supabaseUrl,
      progress: laterChapterProgress,
      initialManifest: manifest,
      loadChapter
    });

    expect(loadChapter).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadedRuntime.bundle?.chapter.id).toBe("chapter_two");
    expect(loadedRuntime.readerState).toEqual(initialReaderState);
  });

  it("falls back to fetching manifest and chapter data when no server bootstrap is provided", async () => {
    const playableBundle = createBundle({
      chapterId: "chapter_one",
      title: "Chapter One",
      orderIndex: 1,
      nextChapterId: null,
      scenes: [
        createScene({
          id: "scene_one",
          title: "Scene One",
          orderIndex: 1,
          dialogueIds: ["line_one"]
        })
      ]
    });
    const manifest = createManifest([
      {
        id: "chapter_one",
        title: "Chapter One",
        slug: "chapter-one",
        orderIndex: 1,
        bundlePath: "runtime/runtime/chapters/chapter_one.json"
      }
    ]);
    const fetchMock = createFetchMock({
      "runtime/runtime/manifest.json": manifest,
      "runtime/runtime/chapters/chapter_one.json": playableBundle
    });

    vi.stubGlobal("fetch", fetchMock);

    const loadedRuntime = await loadPlayerRuntimeSession({
      manifestPath: "runtime/runtime/manifest.json",
      supabaseUrl,
      progress: null
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadedRuntime.manifest).toEqual(manifest);
    expect(loadedRuntime.bundle?.chapter.id).toBe("chapter_one");
    expect(loadedRuntime.readerState).toEqual(initialReaderState);
  });
});
