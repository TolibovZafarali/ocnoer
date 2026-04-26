import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./imagePreload", () => ({
  READER_ASSET_RENDER_CACHE_VERSION: 2,
  ensureChapterAssetsReady: vi.fn(),
  ensureSceneAssetsReady: vi.fn(),
  getAssetCacheErrorMessage: vi.fn(() => null),
  warmNextSceneAssets: vi.fn()
}));

vi.mock("../runtime/runtimeRepository", () => ({
  createMobileRuntimeRepository: vi.fn(() => ({
    loadChapter: vi.fn(),
    loadSession: vi.fn()
  }))
}));

vi.mock("../storage/playerProgressStorage", () => ({
  loadProgressByPlayerId: vi.fn()
}));

vi.mock("../sync/playerProgressSync", () => ({
  saveSyncedPlayerProgress: vi.fn()
}));

import type {
  ReaderState,
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene
} from "@ocnoer/story-core";

import type { NativeReaderPresentation } from "./readerPresentation";
import { ensureSceneAssetsReady } from "./imagePreload";
import {
  commitNativeReaderAdvanceAfterPresentationGate,
  commitNativeReaderStateAfterAssetGate,
  computeNativeReaderAdvanceTargets,
  createNativeReaderPresentationReadinessKey,
  ensureNativeReaderPresentationRenderReady,
  resolveNativeReaderAdvanceCommitPlan
} from "./useNativeReaderController";

const supabaseUrl = "https://example.supabase.co";
const ensureSceneAssetsReadyMock = vi.mocked(ensureSceneAssetsReady);
const manifest: RuntimeManifest = {
  schemaVersion: 1,
  generatedAt: "2026-04-25T00:00:00.000Z",
  firstChapterId: "chapter_one",
  chaptersPath: "runtime/chapters.json",
  charactersPath: "runtime/characters.json",
  assetsPath: "runtime/assets.json",
  chapters: [
    {
      id: "chapter_one",
      title: "Chapter One",
      slug: "chapter-one",
      orderIndex: 1,
      bundlePath: "runtime/chapter-one.json"
    }
  ]
};

function createEntry(input: {
  id: string;
  speaker: RuntimeDialogueEntry["speaker"];
  stage: RuntimeDialogueEntry["stage"];
  text?: string;
}): RuntimeDialogueEntry {
  return {
    id: input.id,
    orderIndex: 1,
    text: input.text ?? "Line.",
    speaker: input.speaker,
    stage: input.stage
  };
}

function createBundle(entries: RuntimeDialogueEntry[]): RuntimeChapterBundle {
  const scene: RuntimeScene = {
    id: "scene_one",
    title: "Scene One",
    orderIndex: 1,
    backgroundImage: {
      id: "background_one",
      label: "Room",
      slug: "room",
      altText: "Room",
      filePath: "runtime/backgrounds/room.png"
    },
    backgroundMusic: null,
    backgroundMusicCues: [],
    carryOcnoerDressSelection: true,
    characterPool: [],
    dialogue: entries
  };

  return {
    schemaVersion: 1,
    generatedAt: "2026-04-25T00:00:00.000Z",
    nextChapterId: null,
    chapter: {
      id: "chapter_one",
      title: "Chapter One",
      slug: "chapter-one",
      orderIndex: 1,
      openingCardText: null,
      endingCardText: null,
      endingCardBackgroundMusic: null,
      scenes: [scene]
    }
  };
}

function createPresentation(
  overrides: Partial<NativeReaderPresentation> = {}
): NativeReaderPresentation {
  return {
    status: "supported",
    entryType: "character",
    chapterId: "chapter_one",
    chapterTitle: "Chapter One",
    sceneId: "scene_one",
    sceneTitle: "Scene One",
    sceneIndex: 0,
    sceneCount: 1,
    dialogueEntryId: "line_one",
    dialogueIndex: 0,
    dialogueCount: 2,
    backgroundImageUrl: `${supabaseUrl}/storage/v1/object/public/runtime/backgrounds/room.png`,
    leftPortrait: {
      key: "left:character_one:default:portrait-one.svg",
      imageUrl: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.svg`,
      label: "Elira",
      side: "left",
      isActiveSpeaker: true
    },
    rightPortrait: null,
    stageCharacters: [],
    dialogueCardPlacement: "speaker-left",
    speakerId: "character_one",
    speakerStatus: "character:character_one:default",
    blockingPreloadImageUrls: [],
    preloadImageUrls: [],
    blockingAssetRefs: [
      {
        role: "portrait",
        url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.svg`,
        storagePath: "runtime/portraits/portrait-one.svg",
        assetId: "character_one",
        cacheKey: "portrait:character_one:default"
      }
    ],
    preloadAssetRefs: [],
    effectiveBranchFlags: {},
    speakerName: "Elira",
    dialogueText: "Line.",
    dressOptions: [],
    selectedDressOptionKey: null,
    needsCatNameInput: false,
    needsDressSelection: false,
    ...overrides
  } as NativeReaderPresentation;
}

describe("commitNativeReaderStateAfterAssetGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for required target assets before committing visible state", async () => {
    let resolveAssets!: () => void;
    const ensureAssets = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAssets = resolve;
        })
    );
    const commit = vi.fn();

    const commitPromise = commitNativeReaderStateAfterAssetGate({
      ensureAssets,
      commit
    });

    await Promise.resolve();

    expect(ensureAssets).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    resolveAssets();
    await commitPromise;

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("does not commit visible state when target assets fail to prepare", async () => {
    const ensureAssets = vi.fn(async () => {
      throw new Error("asset missing");
    });
    const commit = vi.fn();

    await expect(
      commitNativeReaderStateAfterAssetGate({
        ensureAssets,
        commit
      })
    ).rejects.toThrow("asset missing");

    expect(commit).not.toHaveBeenCalled();
  });
});

describe("presentation render readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits a narrator next presentation instantly when it is prewarmed", async () => {
    const ensureRenderReady = vi.fn(async () => undefined);
    const commit = vi.fn();

    const result = await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "narrator-ready",
      targetRenderReady: true,
      ensureRenderReady,
      commit
    });

    expect(result.commitMode).toBe("instant");
    expect(ensureRenderReady).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits a character next presentation instantly when it is prewarmed", async () => {
    const ensureRenderReady = vi.fn(async () => undefined);
    const commit = vi.fn();

    const result = await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "character-ready",
      targetRenderReady: true,
      ensureRenderReady,
      commit
    });

    expect(result.commitMode).toBe("instant");
    expect(ensureRenderReady).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("does not perform cold render preparation on tap when prewarm succeeded", async () => {
    const ensureRenderReady = vi.fn(async () => undefined);

    await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "source-svg-ready",
      targetRenderReady: true,
      ensureRenderReady,
      commit: vi.fn()
    });

    expect(ensureRenderReady).not.toHaveBeenCalled();
  });

  it("blocks the advance before tap-time cold render work when the target is not ready", async () => {
    const ensureRenderReady = vi.fn(async () => undefined);
    const commit = vi.fn();
    const result = await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "character-cold",
      targetRenderReady: false,
      ensureRenderReady,
      commit
    });

    expect(result.commitMode).toBe("blocked");
    expect(result.reason).toBe("target-presentation-not-render-ready");
    expect(ensureRenderReady).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps the next arrow disabled until derivative portraits are warmed", () => {
    const plan = resolveNativeReaderAdvanceCommitPlan({
      targetKey: "character-with-derivative",
      targetRenderReady: false
    });

    expect(plan).toEqual({
      reason: "target-presentation-not-render-ready",
      type: "blocked-until-render-ready"
    });
  });

  it("waits for bitmap derivative readiness before marking a presentation ready", async () => {
    let resolveAssets!: (
      value: Awaited<ReturnType<typeof ensureSceneAssetsReady>>
    ) => void;
    const derivativePresentation = createPresentation({
      blockingAssetRefs: [
        {
          role: "portrait",
          url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.svg`,
          storagePath: "runtime/portraits/portrait-one.svg",
          assetId: "character_one",
          cacheKey: "portrait:character_one:default",
          sourceRenderKind: "svg",
          derivatives: [
            {
              storagePath: "runtime/portraits/portrait-one.reader.webp",
              url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.reader.webp`,
              contentType: "image/webp",
              renderKind: "bitmap",
              width: 900,
              height: 1400,
              hash: "derivative-hash",
              derivativeOf: "runtime/portraits/portrait-one.svg"
            }
          ]
        }
      ]
    });
    ensureSceneAssetsReadyMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAssets = resolve;
      }) as ReturnType<typeof ensureSceneAssetsReady>
    );
    let didResolve = false;
    const readinessPromise = ensureNativeReaderPresentationRenderReady({
      presentation: derivativePresentation,
      reason: "lookahead"
    }).then(() => {
      didResolve = true;
    });

    await Promise.resolve();

    expect(ensureSceneAssetsReadyMock).toHaveBeenCalledWith("line_one", [
      expect.objectContaining({
        derivatives: [
          expect.objectContaining({
            contentType: "image/webp",
            renderKind: "bitmap",
            storagePath: "runtime/portraits/portrait-one.reader.webp"
          })
        ]
      })
    ]);
    expect(didResolve).toBe(false);

    resolveAssets({
      status: "success",
      scope: "scene",
      scopeId: "line_one",
      durationMs: 24,
      assets: [],
      errors: []
    });
    await readinessPromise;

    expect(didResolve).toBe(true);
  });

  it("does not clear the current presentation when the target is not ready", async () => {
    const events: string[] = [];

    await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "portrait-required",
      targetRenderReady: false,
      ensureRenderReady: async () => {
        events.push("portrait-ready");
      },
      commit: () => {
        events.push("current-presentation-cleared");
      }
    });

    expect(events).toEqual([]);
  });

  it("commits the dialogue card and portrait as one target presentation", async () => {
    const plan = resolveNativeReaderAdvanceCommitPlan({
      targetKey: "character-target",
      targetRenderReady: true
    });

    expect(plan).toEqual({
      type: "commit-instant"
    });
  });

  it("warms the next dialogue beat inside the same scene, not only next scene", async () => {
    const bundle = createBundle([
      createEntry({
        id: "line_narrator",
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      }),
      createEntry({
        id: "line_character",
        speaker: {
          type: "character",
          characterId: "character_one",
          characterName: "Elira",
          characterSlug: "elira",
          emotionKey: "default",
          emotionLabel: "Default",
          emotionImagePath: "runtime/portraits/elira.svg"
        },
        stage: {
          left: {
            characterId: "character_one",
            characterName: "Elira",
            characterSlug: "elira",
            emotionKey: "default",
            emotionLabel: "Default",
            imagePath: "runtime/portraits/elira.svg"
          },
          right: null
        }
      })
    ]);
    const targets = await computeNativeReaderAdvanceTargets({
      branchFlags: {},
      catName: null,
      currentRuntimeState: {
        status: "ready",
        manifest,
        bundle,
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 0,
          isChapterComplete: false
        } satisfies ReaderState
      },
      depth: 1,
      loadChapter: vi.fn(),
      supabaseUrl
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.targetPresentation).toMatchObject({
      dialogueEntryId: "line_character",
      dialogueIndex: 1,
      entryType: "character"
    });
    expect(targets[0]?.targetPresentation?.blockingAssetRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "portrait",
          storagePath: "runtime/portraits/elira.svg"
        })
      ])
    );
  });

  it("changes presentation readiness keys with speaker, portrait, dress, background, and branch flags", () => {
    const base = createPresentation();
    const baseKey = createNativeReaderPresentationReadinessKey(base);

    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          speakerName: "Ren"
        })
      )
    ).not.toBe(baseKey);
    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          speakerId: "character_two",
          speakerStatus: "character:character_two:default"
        })
      )
    ).not.toBe(baseKey);
    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          leftPortrait: {
            key: "left:character_two:default:portrait-two.svg",
            imageUrl: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-two.svg`,
            label: "Ren",
            side: "left",
            isActiveSpeaker: true
          }
        })
      )
    ).not.toBe(baseKey);
    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          dressOptions: [
            {
              key: "gala",
              label: "Gala",
              previewImageUrl: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/gala.svg`
            }
          ]
        })
      )
    ).not.toBe(baseKey);
    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          backgroundImageUrl: `${supabaseUrl}/storage/v1/object/public/runtime/backgrounds/hall.png`
        })
      )
    ).not.toBe(baseKey);
    expect(
      createNativeReaderPresentationReadinessKey(
        createPresentation({
          effectiveBranchFlags: {
            "dress:character_one": "gala"
          }
        })
      )
    ).not.toBe(baseKey);
  });
});
