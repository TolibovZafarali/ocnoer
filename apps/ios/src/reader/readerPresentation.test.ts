import { describe, expect, it } from "vitest";

import type {
  ReaderState,
  RuntimeChapterBundle,
  RuntimeCharacterDress,
  RuntimeCharacter,
  RuntimeDialogueEntry,
  RuntimeDialogueSpeaker,
  RuntimeScene,
  RuntimeStageCharacter
} from "@ocnoer/story-core";
import {
  BASE_DRESS_OPTION_KEY,
  getDressBranchFlagKey,
  getPlayerRuntimeChapterAssetRefs
} from "@ocnoer/story-core";

import {
  createNativeReaderPresentation,
  getNativeReaderChapterPortraitAuditEntries
} from "./readerPresentation";

const supabaseUrl = "https://example.supabase.co";
const readerState: ReaderState = {
  sceneIndex: 0,
  dialogueIndex: 0,
  isChapterComplete: false
};

function publicUrl(path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}

function createStageCharacter(input: {
  characterId: string;
  characterName: string;
  characterSlug: string;
  imagePath: string;
  imageDerivatives?: RuntimeStageCharacter["imageDerivatives"];
}): RuntimeStageCharacter {
  return {
    characterId: input.characterId,
    characterName: input.characterName,
    characterSlug: input.characterSlug,
    emotionKey: "default",
    emotionLabel: "Default",
    imagePath: input.imagePath,
    imageDerivatives: input.imageDerivatives
  };
}

function createRuntimeCharacter(input: {
  id: string;
  name: string;
  slug: string;
  imagePath: string;
  dresses?: RuntimeCharacterDress[];
}): RuntimeCharacter {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    bio: null,
    defaultEmotionKey: "default",
    defaultEmotionImagePath: input.imagePath,
    emotions: [
      {
        key: "default",
        label: "Default",
        imagePath: input.imagePath
      }
    ],
    dresses: input.dresses ?? []
  };
}

function createDialogueEntry(input: {
  speaker: RuntimeDialogueSpeaker;
  stage: RuntimeDialogueEntry["stage"];
}): RuntimeDialogueEntry {
  return {
    id: "line_one",
    orderIndex: 1,
    text: "Line one.",
    speaker: input.speaker,
    stage: input.stage
  };
}

function createBundle(input: {
  entry: RuntimeDialogueEntry;
  entries?: RuntimeDialogueEntry[];
  characterPool?: RuntimeCharacter[];
}): RuntimeChapterBundle {
  const scene: RuntimeScene = {
    id: "scene_one",
    title: "Scene One",
    orderIndex: 1,
    backgroundImage: null,
    backgroundMusic: null,
    backgroundMusicCues: [],
    carryOcnoerDressSelection: true,
    characterPool: input.characterPool ?? [],
    dialogue: input.entries ?? [input.entry]
  };

  return {
    schemaVersion: 1,
    generatedAt: "2026-04-24T00:00:00.000Z",
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

describe("createNativeReaderPresentation", () => {
  it("hides staged narrator portraits", () => {
    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle: createBundle({
        entry: createDialogueEntry({
          speaker: {
            type: "narrator"
          },
          stage: {
            left: createStageCharacter({
              characterId: "character_left",
              characterName: "Left",
              characterSlug: "left",
              imagePath: "runtime/media/left.png"
            }),
            right: createStageCharacter({
              characterId: "character_right",
              characterName: "Right",
              characterSlug: "right",
              imagePath: "runtime/media/right.png"
            })
          }
        })
      }),
      readerState,
      branchFlags: {},
      catName: null
    });

    expect(presentation?.leftPortrait).toBeNull();
    expect(presentation?.rightPortrait).toBeNull();
    expect(presentation?.stageCharacters).toEqual([]);
  });

  it("preloads current scene character images before they become active", () => {
    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle: createBundle({
        entry: createDialogueEntry({
          speaker: {
            type: "narrator"
          },
          stage: {
            left: null,
            right: null
          }
        }),
        entries: [
          createDialogueEntry({
            speaker: {
              type: "narrator"
            },
            stage: {
              left: null,
              right: null
            }
          }),
          createDialogueEntry({
            speaker: {
              type: "character",
              characterId: "character_left",
              characterName: "Left",
              characterSlug: "left",
              emotionKey: "default",
              emotionLabel: "Default",
              emotionImagePath: "runtime/media/future-left.svg"
            },
            stage: {
              left: createStageCharacter({
                characterId: "character_left",
                characterName: "Left",
                characterSlug: "left",
                imagePath: "runtime/media/future-left.svg"
              }),
              right: createStageCharacter({
                characterId: "character_right",
                characterName: "Right",
                characterSlug: "right",
                imagePath: "runtime/media/future-right.svg"
              })
            }
          })
        ]
      }),
      readerState,
      branchFlags: {},
      catName: null
    });

    expect(presentation?.stageCharacters).toEqual([]);
    expect(presentation?.preloadImageUrls).toEqual(
      expect.arrayContaining([
        publicUrl("runtime/media/future-left.svg"),
        publicUrl("runtime/media/future-right.svg")
      ])
    );
    expect(presentation?.preloadAssetRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "portrait",
          url: publicUrl("runtime/media/future-left.svg")
        }),
        expect.objectContaining({
          role: "portrait",
          url: publicUrl("runtime/media/future-right.svg")
        })
      ])
    );
    expect(presentation?.blockingPreloadImageUrls).not.toContain(
      publicUrl("runtime/media/future-left.svg")
    );
  });

  it("carries iOS bitmap derivative metadata into blocking portrait asset refs", () => {
    const derivative = {
      storagePath: "runtime/media/future-left.reader.webp",
      contentType: "image/webp",
      renderKind: "bitmap" as const,
      targetPlatform: "ios" as const,
      width: 900,
      height: 1400,
      hash: "derivative-hash",
      sourceHash: "source-hash",
      sourceAssetId: "emotion_default",
      sourceStoragePath: "runtime/media/future-left.svg",
      sourceRenderKind: "svg" as const,
      derivativeOf: "runtime/media/future-left.svg"
    };
    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle: createBundle({
        entry: createDialogueEntry({
          speaker: {
            type: "character",
            characterId: "character_left",
            characterName: "Left",
            characterSlug: "left",
            emotionKey: "default",
            emotionLabel: "Default",
            emotionImagePath: "runtime/media/future-left.svg"
          },
          stage: {
            left: createStageCharacter({
              characterId: "character_left",
              characterName: "Left",
              characterSlug: "left",
              imagePath: "runtime/media/future-left.svg",
              imageDerivatives: [derivative]
            }),
            right: null
          }
        })
      }),
      readerState,
      branchFlags: {},
      catName: null
    });

    expect(presentation?.blockingAssetRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "portrait",
          sourceRenderKind: "svg",
          originalSvgStoragePath: "runtime/media/future-left.svg",
          originalSvgUrl: publicUrl("runtime/media/future-left.svg"),
          iosRenderKind: "bitmap",
          iosDerivativeStoragePath: "runtime/media/future-left.reader.webp",
          iosDerivativeUrl: publicUrl("runtime/media/future-left.reader.webp"),
          iosDerivativeContentType: "image/webp",
          iosDerivativeWidth: 900,
          iosDerivativeHeight: 1400,
          iosDerivativeHash: "derivative-hash",
          derivatives: [
            expect.objectContaining({
              url: publicUrl("runtime/media/future-left.reader.webp"),
              renderKind: "bitmap"
            })
          ]
        })
      ])
    );
  });

  it("builds chapter-level asset refs from every scene", () => {
    const bundle = createBundle({
      entry: createDialogueEntry({
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      }),
      entries: [
        createDialogueEntry({
          speaker: {
            type: "character",
            characterId: "character_left",
            characterName: "Left",
            characterSlug: "left",
            emotionKey: "default",
            emotionLabel: "Default",
            emotionImagePath: "runtime/media/future-left.svg"
          },
          stage: {
            left: createStageCharacter({
              characterId: "character_left",
              characterName: "Left",
              characterSlug: "left",
              imagePath: "runtime/media/future-left.svg"
            }),
            right: null
          }
        })
      ]
    });

    expect(
      getPlayerRuntimeChapterAssetRefs({
        supabaseUrl,
        bundle,
        branchFlags: {}
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "portrait",
          url: publicUrl("runtime/media/future-left.svg")
        })
      ])
    );
  });

  it("resolves carry-disabled scene assets with default dress flags", () => {
    const character = createRuntimeCharacter({
      id: "character_ocnoer",
      name: "Ocnoer",
      slug: "ocnoer",
      imagePath: "runtime/media/ocnoer-default.png",
      dresses: [
        {
          key: "gala",
          label: "Gala",
          emotionOverrides: [
            {
              emotionKey: "default",
              imagePath: "runtime/media/ocnoer-gala.png"
            }
          ]
        }
      ]
    });
    const bundle = createBundle({
      characterPool: [character],
      entry: createDialogueEntry({
        speaker: {
          type: "character",
          characterId: "character_ocnoer",
          characterName: "Ocnoer",
          characterSlug: "ocnoer",
          emotionKey: "default",
          emotionLabel: "Default",
          emotionImagePath: "runtime/media/ocnoer-default.png"
        },
        stage: {
          left: createStageCharacter({
            characterId: "character_ocnoer",
            characterName: "Ocnoer",
            characterSlug: "ocnoer",
            imagePath: "runtime/media/ocnoer-default.png"
          }),
          right: null
        }
      })
    });

    bundle.chapter.scenes[0]!.carryOcnoerDressSelection = false;

    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle,
      readerState,
      branchFlags: {
        [getDressBranchFlagKey("character_ocnoer")]: "gala"
      },
      catName: null
    });

    expect(presentation?.leftPortrait?.imageUrl).toBe(
      publicUrl("runtime/media/ocnoer-default.png")
    );
    expect(presentation?.blockingAssetRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: publicUrl("runtime/media/ocnoer-default.png")
        })
      ])
    );
    expect(presentation?.blockingAssetRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: publicUrl("runtime/media/ocnoer-gala.png")
        })
      ])
    );
    expect(
      presentation?.effectiveBranchFlags[
        getDressBranchFlagKey("character_ocnoer")
      ]
    ).toBe(BASE_DRESS_OPTION_KEY);
  });

  it("shows only the staged dress-prompt speaker", () => {
    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle: createBundle({
        entry: createDialogueEntry({
          speaker: {
            type: "dress_prompt",
            characterId: "character_left",
            characterName: "Left",
            characterSlug: "left",
            dressOptions: []
          },
          stage: {
            left: createStageCharacter({
              characterId: "character_left",
              characterName: "Left",
              characterSlug: "left",
              imagePath: "runtime/media/left.png"
            }),
            right: createStageCharacter({
              characterId: "character_right",
              characterName: "Right",
              characterSlug: "right",
              imagePath: "runtime/media/right.png"
            })
          }
        })
      }),
      readerState,
      branchFlags: {},
      catName: null
    });

    expect(presentation?.leftPortrait).toMatchObject({
      side: "left",
      imageUrl: publicUrl("runtime/media/left.png"),
      isActiveSpeaker: true
    });
    expect(presentation?.rightPortrait).toBeNull();
    expect(presentation?.stageCharacters).toHaveLength(1);
  });

  it("falls back to the cat-name prompt character when it is not staged", () => {
    const presentation = createNativeReaderPresentation({
      supabaseUrl,
      bundle: createBundle({
        characterPool: [
          createRuntimeCharacter({
            id: "character_cat",
            name: "Cat",
            slug: "cat",
            imagePath: "runtime/media/cat-default.png"
          })
        ],
        entry: createDialogueEntry({
          speaker: {
            type: "cat_name_prompt",
            characterId: "character_cat",
            characterName: "Cat",
            characterSlug: "cat"
          },
          stage: {
            left: null,
            right: null
          }
        })
      }),
      readerState,
      branchFlags: {},
      catName: null
    });

    expect(presentation?.leftPortrait).toBeNull();
    expect(presentation?.rightPortrait).toMatchObject({
      side: "right",
      imageUrl: publicUrl("runtime/media/cat-default.png"),
      isActiveSpeaker: true
    });
    expect(presentation?.stageCharacters).toHaveLength(1);
  });

  it("audits all character portrait variants in the loaded chapter", () => {
    const derivative = {
      storagePath: "runtime/media/left.reader.webp",
      contentType: "image/webp",
      renderKind: "bitmap" as const,
      targetPlatform: "ios" as const,
      width: 900,
      height: 1400,
      hash: "derivative-hash",
      sourceHash: "source-hash",
      sourceAssetId: "emotion_default",
      sourceStoragePath: "runtime/media/left.svg",
      sourceRenderKind: "svg" as const,
      derivativeOf: "runtime/media/left.svg"
    };
    const bundle = createBundle({
      characterPool: [
        createRuntimeCharacter({
          id: "character_left",
          name: "Left",
          slug: "left",
          imagePath: "runtime/media/left.svg",
          dresses: [
            {
              key: "gala",
              label: "Gala",
              emotionOverrides: [
                {
                  emotionKey: "default",
                  imagePath: "runtime/media/left-gala.svg",
                  imageDerivatives: [derivative]
                }
              ]
            }
          ]
        })
      ],
      entry: createDialogueEntry({
        speaker: {
          type: "narrator"
        },
        stage: {
          left: null,
          right: null
        }
      })
    });

    const auditEntries = getNativeReaderChapterPortraitAuditEntries({
      supabaseUrl,
      bundle
    });

    expect(auditEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterId: "character_left",
          emotionKey: "default",
          dressKey: null,
          assetRef: expect.objectContaining({
            url: publicUrl("runtime/media/left.svg")
          })
        }),
        expect.objectContaining({
          characterId: "character_left",
          emotionKey: "default",
          dressKey: "gala",
          assetRef: expect.objectContaining({
            derivatives: [
              expect.objectContaining({
                url: publicUrl("runtime/media/left.reader.webp")
              })
            ],
            iosDerivativeStoragePath: "runtime/media/left.reader.webp"
          })
        })
      ])
    );
  });
});
