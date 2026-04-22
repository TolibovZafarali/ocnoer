import { describe, expect, it } from "vitest";

import {
  compileRuntimeChapterBundle,
  compileRuntimeStory
} from "@/lib/story/published";
import type { StoryAuthoringSnapshot } from "@/lib/story/types";

const snapshot: StoryAuthoringSnapshot = {
  characters: [
    {
      id: "character_ocnoer",
      name: "Ocnoer",
      slug: "ocnoer",
      bio: null,
      defaultEmotionKey: "calm",
      emotions: [
        {
          id: "emotion_calm",
          key: "calm",
          label: "Calm",
          imagePath: "runtime/media/ocnoer-calm.png",
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z"
        },
        {
          id: "emotion_smile",
          key: "smile",
          label: "Smile",
          imagePath: "runtime/media/ocnoer-smile.png",
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z"
        }
      ],
      dresses: [],
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z"
    },
    {
      id: "character_ren",
      name: "Ren",
      slug: "ren",
      bio: null,
      defaultEmotionKey: "neutral",
      emotions: [
        {
          id: "emotion_neutral",
          key: "neutral",
          label: "Neutral",
          imagePath: "runtime/media/ren-neutral.png",
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z"
        }
      ],
      dresses: [],
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z"
    }
  ],
  backgroundImages: [
    {
      id: "bg_hall",
      type: "background_image",
      label: "Hall",
      slug: "hall",
      altText: "Stone hall",
      filePath: "runtime/media/hall.png",
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z"
    }
  ],
  backgroundMusicTracks: [
    {
      id: "music_theme",
      type: "background_music",
      label: "Theme",
      slug: "theme",
      filePath: "runtime/media/theme.mp3",
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z"
    }
  ],
  chapters: [
    {
      id: "chapter_one",
      title: "Chapter One",
      slug: "chapter-one",
      orderIndex: 1,
      openingCardText: null,
      endingCardText: null,
      endingCardBackgroundMusicAssetId: null,
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
      scenes: [
        {
          id: "scene_one",
          title: "Opening",
          orderIndex: 1,
          backgroundImageAssetId: "bg_hall",
          backgroundMusicAssetId: "music_theme",
          carryOcnoerDressSelection: true,
          characterIds: ["character_ocnoer", "character_ren"],
          createdAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:00:00.000Z",
          dialogue: [
            {
              id: "dialogue_narrator",
              orderIndex: 1,
              text: "The hall is quiet.",
              speaker: {
                type: "narrator"
              },
              createdAt: "2026-03-16T00:00:00.000Z",
              updatedAt: "2026-03-16T00:00:00.000Z"
            },
            {
              id: "dialogue_ren",
              orderIndex: 2,
              text: "Are you ready?",
              speaker: {
                type: "character",
                characterId: "character_ren",
                emotionKey: "neutral"
              },
              createdAt: "2026-03-16T00:00:00.000Z",
              updatedAt: "2026-03-16T00:00:00.000Z"
            },
            {
              id: "dialogue_ocnoer",
              orderIndex: 3,
              text: "I am.",
              speaker: {
                type: "character",
                characterId: "character_ocnoer",
                emotionKey: "smile"
              },
              createdAt: "2026-03-16T00:00:00.000Z",
              updatedAt: "2026-03-16T00:00:00.000Z"
            }
          ]
        }
      ]
    }
  ]
};

describe("compileRuntimeStory", () => {
  it("can compile a single chapter bundle identical to the full compile output", () => {
    const input = {
      snapshot,
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-16T01:00:00.000Z"
    } as const;

    const fullCompile = compileRuntimeStory(input);
    const singleBundle = compileRuntimeChapterBundle({
      ...input,
      chapterId: "chapter_one"
    });

    expect(singleBundle).toEqual(fullCompile.chapterBundles[0]);
  });

  it("embeds direct media paths and computes simple two-character stage data", () => {
    const compiled = compileRuntimeStory({
      snapshot,
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-16T01:00:00.000Z"
    });

    expect(compiled.manifest.firstChapterId).toBe("chapter_one");
    expect(compiled.manifest.chapters[0]?.bundlePath).toBe(
      "runtime/runtime/chapters/chapter_one.json"
    );

    const bundle = compiled.chapterBundles[0]?.bundle;
    expect(bundle?.chapter.openingCardText).toBeNull();
    expect(bundle?.chapter.endingCardText).toBeNull();
    expect(bundle?.chapter.endingCardBackgroundMusic).toBeNull();
    const scene = bundle?.chapter.scenes[0];
    const narratorEntry = scene?.dialogue[0];
    const renEntry = scene?.dialogue[1];
    const ocnoerEntry = scene?.dialogue[2];

    expect(scene?.backgroundImage?.filePath).toBe("runtime/media/hall.png");
    expect(scene?.backgroundMusic?.filePath).toBe("runtime/media/theme.mp3");
    expect(scene?.carryOcnoerDressSelection).toBe(true);
    expect(narratorEntry?.stage.left?.characterSlug).toBe("ocnoer");
    expect(narratorEntry?.stage.right).toBeNull();
    expect(renEntry?.stage.left?.characterSlug).toBe("ocnoer");
    expect(renEntry?.stage.right?.characterSlug).toBe("ren");
    expect(ocnoerEntry?.stage.left?.emotionKey).toBe("smile");
    expect(ocnoerEntry?.stage.right?.characterSlug).toBe("ren");
    expect(ocnoerEntry?.speaker.type).toBe("character");
    if (ocnoerEntry?.speaker.type === "character") {
      expect(ocnoerEntry.speaker.emotionImagePath).toBe(
        "runtime/media/ocnoer-smile.png"
      );
    }
  });

  it("allows scenes without background images", () => {
    const compiled = compileRuntimeStory({
      snapshot: {
        ...snapshot,
        chapters: [
          {
            ...snapshot.chapters[0],
            scenes: [
              {
                ...snapshot.chapters[0].scenes[0],
                backgroundImageAssetId: null
              }
            ]
          }
        ]
      },
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-16T01:00:00.000Z"
    });

    expect(
      compiled.chapterBundles[0]?.bundle.chapter.scenes[0]?.backgroundImage
    ).toBeNull();
  });

  it("includes chapter black-card text in the runtime bundle", () => {
    const compiled = compileRuntimeStory({
      snapshot: {
        ...snapshot,
        chapters: [
          {
            ...snapshot.chapters[0],
            openingCardText: "Open with silence.",
            endingCardText: "Close in darkness.",
            endingCardBackgroundMusicAssetId: "music_theme"
          }
        ]
      },
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-16T01:00:00.000Z"
    });

    expect(compiled.chapterBundles[0]?.bundle.chapter.openingCardText).toBe(
      "Open with silence."
    );
    expect(compiled.chapterBundles[0]?.bundle.chapter.endingCardText).toBe(
      "Close in darkness."
    );
    expect(
      compiled.chapterBundles[0]?.bundle.chapter.endingCardBackgroundMusic
        ?.filePath
    ).toBe("runtime/media/theme.mp3");
  });

  it("falls back to the left stage when Ocnoer is absent from a scene", () => {
    const compiled = compileRuntimeStory({
      snapshot: {
        ...snapshot,
        chapters: [
          {
            id: "chapter_two",
            title: "Chapter Two",
            slug: "chapter-two",
            orderIndex: 1,
            openingCardText: null,
            endingCardText: null,
            endingCardBackgroundMusicAssetId: null,
            createdAt: "2026-03-16T00:00:00.000Z",
            updatedAt: "2026-03-16T00:00:00.000Z",
            scenes: [
              {
                id: "scene_two",
                title: "Ren Alone",
                orderIndex: 1,
                backgroundImageAssetId: "bg_hall",
                backgroundMusicAssetId: null,
                carryOcnoerDressSelection: true,
                characterIds: ["character_ren"],
                createdAt: "2026-03-16T00:00:00.000Z",
                updatedAt: "2026-03-16T00:00:00.000Z",
                dialogue: [
                  {
                    id: "dialogue_intro",
                    orderIndex: 1,
                    text: "A quiet room settles around Ren.",
                    speaker: {
                      type: "narrator"
                    },
                    createdAt: "2026-03-16T00:00:00.000Z",
                    updatedAt: "2026-03-16T00:00:00.000Z"
                  },
                  {
                    id: "dialogue_ren_first",
                    orderIndex: 2,
                    text: "I have to keep moving.",
                    speaker: {
                      type: "character",
                      characterId: "character_ren",
                      emotionKey: "neutral"
                    },
                    createdAt: "2026-03-16T00:00:00.000Z",
                    updatedAt: "2026-03-16T00:00:00.000Z"
                  }
                ]
              }
            ]
          }
        ]
      },
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-16T01:00:00.000Z"
    });

    const bundle = compiled.chapterBundles[0]?.bundle;
    const renEntry = bundle?.chapter.scenes[0]?.dialogue[1];

    expect(bundle?.chapter.scenes[0]?.carryOcnoerDressSelection).toBe(true);
    expect(renEntry?.speaker.type).toBe("character");
    expect(renEntry?.stage.left?.characterSlug).toBe("ren");
    expect(renEntry?.stage.right).toBeNull();
  });

  it("uses updated emotion image paths in compiled dialogue and stage portraits", () => {
    const updatedSnapshot: StoryAuthoringSnapshot = {
      ...snapshot,
      characters: snapshot.characters.map((character) =>
        character.id === "character_ocnoer"
          ? {
              ...character,
              emotions: character.emotions.map((emotion) =>
                emotion.key === "smile"
                  ? {
                      ...emotion,
                      imagePath:
                        "runtime/media/characters/character_ocnoer/emotion_smile/file_v2.png",
                      updatedAt: "2026-03-20T00:00:00.000Z"
                    }
                  : emotion
              )
            }
          : character
      )
    };

    const compiled = compileRuntimeStory({
      snapshot: updatedSnapshot,
      bucket: "runtime",
      runtimePrefix: "runtime",
      generatedAt: "2026-03-20T01:00:00.000Z"
    });

    const ocnoerEntry =
      compiled.chapterBundles[0]?.bundle.chapter.scenes[0]?.dialogue[2];
    const expectedPath =
      "runtime/media/characters/character_ocnoer/emotion_smile/file_v2.png";

    expect(ocnoerEntry?.speaker.type).toBe("character");
    if (ocnoerEntry?.speaker.type === "character") {
      expect(ocnoerEntry.speaker.emotionImagePath).toBe(expectedPath);
    }
    expect(ocnoerEntry?.stage.left?.imagePath).toBe(expectedPath);
  });
});
