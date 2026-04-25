import { describe, expect, it, vi } from "vitest";

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
import {
  commitNativeReaderAdvanceAfterPresentationGate,
  commitNativeReaderStateAfterAssetGate,
  computeNativeReaderAdvanceTargets,
  createNativeReaderPresentationReadinessKey,
  resolveNativeReaderAdvanceCommitPlan
} from "./useNativeReaderController";

const supabaseUrl = "https://example.supabase.co";
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

  it("holds the previous presentation if the target character is not render-ready", async () => {
    let resolveRenderReady!: () => void;
    const ensureRenderReady = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRenderReady = resolve;
        })
    );
    const commit = vi.fn();
    const commitPromise = commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "character-cold",
      targetRenderReady: false,
      ensureRenderReady,
      commit
    });

    await Promise.resolve();

    expect(ensureRenderReady).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    resolveRenderReady();
    const result = await commitPromise;

    expect(result.commitMode).toBe("waited");
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("does not commit the target dialogue card before the target portrait is render-ready", async () => {
    const events: string[] = [];

    await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "portrait-required",
      targetRenderReady: false,
      ensureRenderReady: async () => {
        events.push("portrait-ready");
      },
      commit: () => {
        events.push("card-and-portrait-committed");
      }
    });

    expect(events).toEqual(["portrait-ready", "card-and-portrait-committed"]);
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
