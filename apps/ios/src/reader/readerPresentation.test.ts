import { describe, expect, it } from "vitest";

import type {
  ReaderState,
  RuntimeChapterBundle,
  RuntimeCharacter,
  RuntimeDialogueEntry,
  RuntimeDialogueSpeaker,
  RuntimeScene,
  RuntimeStageCharacter
} from "@ocnoer/story-core";

import { createNativeReaderPresentation } from "./readerPresentation";

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

function createRuntimeCharacter(input: {
  id: string;
  name: string;
  slug: string;
  imagePath: string;
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
    dresses: []
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
    dialogue: [input.entry]
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
});
