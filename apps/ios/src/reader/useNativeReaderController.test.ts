import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./imagePreload", () => ({
  READER_ASSET_RENDER_CACHE_VERSION: 3,
  dumpReaderAssetRenderModes: vi.fn(() => ({
    generatedAt: "2026-04-25T00:00:00.000Z",
    assets: [],
    summary: {
      totalCharacterPortraitsFound: 0,
      bitmapDerivativeCount: 0,
      missingDerivativeMetadataCount: 0,
      derivativeUrlMissingOr404Count: 0,
      svgFallbackCount: 0,
      notLocallyCachedCount: 0,
      notImageRefWarmedCount: 0,
      coldVisibleRenderCount: 0,
      imageRefReadyCount: 0,
      renderModeCounts: {}
    }
  })),
  ensureChapterAssetsReady: vi.fn(),
  ensureSceneAssetsReady: vi.fn(),
  getAssetCacheErrorMessage: vi.fn(() => null),
  getSelectedReaderAssetDerivativeMetadata: vi.fn((assetRef: any) =>
    assetRef.derivatives?.[0]
      ? {
          cacheVersion: assetRef.derivatives[0].cacheVersion ?? null,
          compressedBytes: assetRef.derivatives[0].compressedBytes ?? null,
          contentType: assetRef.derivatives[0].contentType,
          decodedBytesEstimate:
            assetRef.derivatives[0].decodedBytesEstimate ?? null,
          hash: assetRef.derivatives[0].hash ?? null,
          height: assetRef.derivatives[0].height ?? null,
          renderVersion: assetRef.derivatives[0].renderVersion ?? null,
          requiredHeightPx: 1026,
          requiredWidthPx: 684,
          stageHeight: 852,
          stageWidth: 393,
          storagePath: assetRef.derivatives[0].storagePath,
          variantKey: assetRef.derivatives[0].variantKey ?? null,
          width: assetRef.derivatives[0].width ?? null
        }
      : null
  ),
  isReaderPerfDiagnosticsEnabled: vi.fn(() => false),
  verifyReaderPortraitDerivativeUrls: vi.fn(async (dump) => dump),
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
import { NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS } from "./nativeReaderDialogueMotion";
import {
  NATIVE_OPENING_TRANSITION_COVER_MS,
  NATIVE_OPENING_TRANSITION_MIN_BLACKOUT_MS,
  NATIVE_OPENING_TRANSITION_POST_COMMIT_HOLD_MS,
  NATIVE_SCENE_TRANSITION_COVER_MS,
  NATIVE_SCENE_TRANSITION_MIN_BLACKOUT_MS,
  NATIVE_SCENE_TRANSITION_POST_COMMIT_HOLD_MS,
  NATIVE_SCENE_TRANSITION_REVEAL_MS,
  canNativeReaderAdvanceWithReadiness,
  commitNativeReaderAdvanceAfterPresentationGate,
  commitNativeReaderStateAfterAssetGate,
  computeNativeReaderAdvanceTargets,
  createNativeReaderPresentationReadinessKey,
  ensureNativeReaderPresentationRenderReady,
  getNativeReaderOpeningBoundaryForRetreat,
  getNativeReaderProgressBranchFlags,
  resolveNativeReaderAdvanceCommitPlan,
  runNativeReaderSceneTransition
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

describe("native opening boundary retreat", () => {
  it("treats the chapter opening card as previous state at the first line", () => {
    const bundle = createBundle([
      createEntry({
        id: "line_one",
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      })
    ]);
    bundle.chapter.openingCardText = "In the beginning, there was darkness.";

    expect(
      getNativeReaderOpeningBoundaryForRetreat({
        manifest,
        bundle,
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 0,
          isChapterComplete: false
        }
      })
    ).toMatchObject({
      type: "chapter-opening-card",
      chapterId: "chapter_one",
      text: "In the beginning, there was darkness."
    });
  });

  it("does not restore the opening card once a previous dialogue line exists", () => {
    const bundle = createBundle([
      createEntry({
        id: "line_one",
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      }),
      createEntry({
        id: "line_two",
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      })
    ]);
    bundle.chapter.openingCardText = "In the beginning, there was darkness.";

    expect(
      getNativeReaderOpeningBoundaryForRetreat({
        manifest,
        bundle,
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 1,
          isChapterComplete: false
        }
      })
    ).toBeNull();
  });

  it("does not create a retreat boundary when no opening card is published", () => {
    const bundle = createBundle([
      createEntry({
        id: "line_one",
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      })
    ]);

    expect(
      getNativeReaderOpeningBoundaryForRetreat({
        manifest,
        bundle,
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 0,
          isChapterComplete: false
        }
      })
    ).toBeNull();
  });
});

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

  it("can hold a regular dialogue commit for calmer card pacing", async () => {
    const ensureRenderReady = vi.fn(async () => undefined);
    const events: string[] = [];

    const result = await commitNativeReaderAdvanceAfterPresentationGate({
      targetKey: "line-ready",
      targetRenderReady: true,
      ensureRenderReady,
      commitDelayMs: NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS,
      wait: async (durationMs) => {
        events.push(`wait:${durationMs}`);
      },
      commit: () => {
        events.push("commit");
      }
    });

    expect(result.commitMode).toBe("instant");
    expect(result.waitDurationMs).toBe(
      NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS
    );
    expect(events).toEqual([
      `wait:${NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS}`,
      "commit"
    ]);
    expect(ensureRenderReady).not.toHaveBeenCalled();
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

    expect(ensureSceneAssetsReadyMock).toHaveBeenCalledWith(
      "line_one",
      [
        expect.objectContaining({
          derivatives: [
            expect.objectContaining({
              contentType: "image/webp",
              renderKind: "bitmap",
              storagePath: "runtime/portraits/portrait-one.reader.webp"
            })
          ]
        })
      ],
      "high"
    );
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

  it("includes every blocking character portrait in presentation readiness", async () => {
    const presentation = createPresentation({
      blockingAssetRefs: [
        {
          role: "portrait",
          url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/left.svg`,
          storagePath: "runtime/portraits/left.svg",
          cacheKey: "portrait:left",
          sourceRenderKind: "svg"
        },
        {
          role: "portrait",
          url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/right.svg`,
          storagePath: "runtime/portraits/right.svg",
          cacheKey: "portrait:right",
          sourceRenderKind: "svg"
        }
      ]
    });
    ensureSceneAssetsReadyMock.mockResolvedValueOnce({
      status: "success",
      scope: "scene",
      scopeId: "line_one",
      durationMs: 1,
      assets: [],
      errors: []
    });

    await ensureNativeReaderPresentationRenderReady({
      presentation,
      reason: "lookahead"
    });

    expect(ensureSceneAssetsReadyMock).toHaveBeenCalledWith(
      "line_one",
      [
        expect.objectContaining({
          storagePath: "runtime/portraits/left.svg"
        }),
        expect.objectContaining({
          storagePath: "runtime/portraits/right.svg"
        })
      ],
      "high"
    );
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

  it("changes presentation readiness keys when the selected derivative variant changes", () => {
    const base = createPresentation({
      blockingAssetRefs: [
        {
          role: "portrait",
          url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.svg`,
          storagePath: "runtime/portraits/portrait-one.svg",
          assetId: "character_one",
          cacheKey: "portrait:character_one:default",
          derivatives: [
            {
              storagePath:
                "runtime/portraits/portrait-one.phone-3x.reader.webp",
              url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.phone-3x.reader.webp`,
              contentType: "image/webp",
              renderKind: "bitmap",
              variantKey: "phone-3x",
              width: 752,
              height: 1129,
              hash: "phone3",
              derivativeOf: "runtime/portraits/portrait-one.svg"
            }
          ]
        }
      ]
    });
    const next = createPresentation({
      blockingAssetRefs: [
        {
          ...base.blockingAssetRefs[0]!,
          derivatives: [
            {
              storagePath: "runtime/portraits/portrait-one.full.reader.webp",
              url: `${supabaseUrl}/storage/v1/object/public/runtime/portraits/portrait-one.full.reader.webp`,
              contentType: "image/webp",
              renderKind: "bitmap",
              variantKey: "full",
              width: 1024,
              height: 1536,
              hash: "full",
              derivativeOf: "runtime/portraits/portrait-one.svg"
            }
          ]
        }
      ]
    });

    expect(createNativeReaderPresentationReadinessKey(next)).not.toBe(
      createNativeReaderPresentationReadinessKey(base)
    );
  });
});

describe("native scene transition choreography", () => {
  function createDeferredWait() {
    const waits: Array<{
      durationMs: number;
      resolve: () => void;
    }> = [];
    const wait = vi.fn(
      (durationMs: number) =>
        new Promise<void>((resolve) => {
          waits.push({
            durationMs,
            resolve
          });
        })
    );

    return {
      wait,
      waits
    };
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("waits for the full fade, minimum blackout, preparation, and reveal", async () => {
    const events: string[] = [];
    const { wait, waits } = createDeferredWait();
    let resolvePrepare!: () => void;
    const prepare = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          events.push("prepare:start");
          resolvePrepare = () => {
            events.push("prepare:ready");
            resolve();
          };
        })
    );
    const commit = vi.fn(() => {
      events.push("commit");
    });
    const transitionPromise = runNativeReaderSceneTransition({
      commit,
      prepare,
      setPhase: (phase) => {
        events.push(`phase:${phase}`);
      },
      wait
    });

    expect(events).toEqual(["phase:covering"]);
    expect(waits[0]?.durationMs).toBe(NATIVE_SCENE_TRANSITION_COVER_MS);
    expect(commit).not.toHaveBeenCalled();

    waits[0]?.resolve();
    await flushPromises();

    expect(events).toEqual([
      "phase:covering",
      "phase:blackout",
      "prepare:start"
    ]);
    expect(waits[1]?.durationMs).toBe(NATIVE_SCENE_TRANSITION_MIN_BLACKOUT_MS);
    expect(commit).not.toHaveBeenCalled();

    waits[1]?.resolve();
    await flushPromises();
    expect(commit).not.toHaveBeenCalled();

    resolvePrepare();
    await flushPromises();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(waits[2]?.durationMs).toBe(
      NATIVE_SCENE_TRANSITION_POST_COMMIT_HOLD_MS
    );

    waits[2]?.resolve();
    await flushPromises();

    expect(events.at(-1)).toBe("phase:revealing");
    expect(waits[3]?.durationMs).toBe(NATIVE_SCENE_TRANSITION_REVEAL_MS);

    waits[3]?.resolve();
    await transitionPromise;

    expect(events.at(-1)).toBe("phase:idle");
  });

  it("holds the opening blackout for at least three seconds before reveal", async () => {
    const events: string[] = [];
    const { wait, waits } = createDeferredWait();
    const commit = vi.fn(() => {
      events.push("commit");
    });
    const transitionPromise = runNativeReaderSceneTransition({
      coverDurationMs: NATIVE_OPENING_TRANSITION_COVER_MS,
      minimumBlackoutMs: NATIVE_OPENING_TRANSITION_MIN_BLACKOUT_MS,
      postCommitHoldMs: NATIVE_OPENING_TRANSITION_POST_COMMIT_HOLD_MS,
      prepare: vi.fn(async () => {
        events.push("prepare");
      }),
      commit,
      setPhase: (phase) => {
        events.push(`phase:${phase}`);
      },
      wait
    });

    expect(waits[0]?.durationMs).toBe(NATIVE_OPENING_TRANSITION_COVER_MS);

    waits[0]?.resolve();
    await flushPromises();

    expect(events).toEqual(["phase:covering", "phase:blackout", "prepare"]);
    expect(waits[1]?.durationMs).toBe(
      NATIVE_OPENING_TRANSITION_MIN_BLACKOUT_MS
    );
    expect(NATIVE_OPENING_TRANSITION_MIN_BLACKOUT_MS).toBeGreaterThanOrEqual(
      3000
    );
    expect(commit).not.toHaveBeenCalled();

    waits[1]?.resolve();
    await flushPromises();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(waits[2]?.durationMs).toBe(
      NATIVE_OPENING_TRANSITION_POST_COMMIT_HOLD_MS
    );

    waits[2]?.resolve();
    await flushPromises();

    expect(events.at(-1)).toBe("phase:revealing");
    expect(waits[3]?.durationMs).toBe(NATIVE_SCENE_TRANSITION_REVEAL_MS);

    waits[3]?.resolve();
    await transitionPromise;

    expect(events.at(-1)).toBe("phase:idle");
  });

  it("keeps blackout after commit until post-commit audio work completes", async () => {
    const events: string[] = [];
    const { wait, waits } = createDeferredWait();
    let resolveAudioStart!: () => void;
    const prepare = vi.fn(async () => {
      events.push("prepare");
    });
    const afterCommit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          events.push("audio:start");
          resolveAudioStart = () => {
            events.push("audio:ready");
            resolve();
          };
        })
    );
    const commit = vi.fn(() => {
      events.push("commit");
    });
    const transitionPromise = runNativeReaderSceneTransition({
      afterCommit,
      commit,
      prepare,
      setPhase: (phase) => {
        events.push(`phase:${phase}`);
      },
      wait
    });

    waits[0]?.resolve();
    await flushPromises();
    waits[1]?.resolve();
    await flushPromises();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "phase:covering",
      "phase:blackout",
      "prepare",
      "commit",
      "audio:start"
    ]);
    expect(waits[2]?.durationMs).toBe(
      NATIVE_SCENE_TRANSITION_POST_COMMIT_HOLD_MS
    );

    waits[2]?.resolve();
    await flushPromises();

    expect(events.at(-1)).toBe("audio:start");

    resolveAudioStart();
    await flushPromises();

    expect(events.at(-1)).toBe("phase:revealing");
    expect(waits[3]?.durationMs).toBe(NATIVE_SCENE_TRANSITION_REVEAL_MS);

    waits[3]?.resolve();
    await transitionPromise;

    expect(events.at(-1)).toBe("phase:idle");
  });

  it("does not commit the next scene when preparation fails", async () => {
    const events: string[] = [];
    const { wait, waits } = createDeferredWait();
    let rejectPrepare!: (error: Error) => void;
    const prepare = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          events.push("prepare:start");
          rejectPrepare = reject;
        })
    );
    const commit = vi.fn();
    const transitionPromise = runNativeReaderSceneTransition({
      commit,
      prepare,
      setPhase: (phase) => {
        events.push(`phase:${phase}`);
      },
      wait
    });

    waits[0]?.resolve();
    await flushPromises();
    waits[1]?.resolve();
    rejectPrepare(new Error("asset missing"));
    await flushPromises();

    expect(commit).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe("phase:revealing");

    waits[2]?.resolve();

    await expect(transitionPromise).rejects.toThrow("asset missing");
    expect(events.at(-1)).toBe("phase:idle");
  });
});

describe("native advance readiness", () => {
  it("allows pending scene transitions to enter blackout before preloading completes", () => {
    expect(
      canNativeReaderAdvanceWithReadiness({
        advanceResultType: "scene-transition",
        presentationRenderKey: "current",
        readinessSourceKey: "current",
        readinessStatus: "pending"
      })
    ).toBe(true);
  });

  it("allows pending chapter breaks to enter blackout before preloading completes", () => {
    expect(
      canNativeReaderAdvanceWithReadiness({
        advanceResultType: "chapter-break",
        presentationRenderKey: "current",
        readinessSourceKey: "current",
        readinessStatus: "pending"
      })
    ).toBe(true);
  });

  it("keeps non-transition advances blocked until the target is ready", () => {
    expect(
      canNativeReaderAdvanceWithReadiness({
        advanceResultType: "line",
        presentationRenderKey: "current",
        readinessSourceKey: "current",
        readinessStatus: "pending"
      })
    ).toBe(false);
  });

  it("allows any matching ready advance target", () => {
    expect(
      canNativeReaderAdvanceWithReadiness({
        advanceResultType: "line",
        presentationRenderKey: "current",
        readinessSourceKey: "current",
        readinessStatus: "ready"
      })
    ).toBe(true);
  });
});

describe("native cat-name progress persistence", () => {
  it("strips pending cat-name flags from progress sync until boundary save", () => {
    expect(
      getNativeReaderProgressBranchFlags({
        branchFlags: {
          cat_name: "Miso",
          cat_name_locked: true,
          "dress:ocnoer": "gala"
        },
        pendingCatNameCommit: "Miso"
      })
    ).toEqual({
      "dress:ocnoer": "gala"
    });
  });

  it("keeps already persisted cat-name flags in progress sync", () => {
    const branchFlags = {
      cat_name: "Miso",
      cat_name_locked: true
    };

    expect(
      getNativeReaderProgressBranchFlags({
        branchFlags,
        pendingCatNameCommit: null
      })
    ).toBe(branchFlags);
  });
});
