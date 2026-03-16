import { DialogueKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  compilePublishedStory,
  getManifestChapterById,
  resolvePromptContext,
  validateStoryForPublish
} from "@/lib/story/published";

const storyGraphFixture = {
  chapters: [
    {
      publicId: "chapter-public-1",
      title: "Chapter 1",
      slug: "chapter-1",
      orderIndex: 1,
      imageAsset: {
        storagePath: "chapters/ch1.jpg"
      },
      scenes: [
        {
          id: "scene-1-db",
          publicId: "scene-public-1",
          title: "Scene 1",
          orderIndex: 1,
          backgroundImageAsset: {
            storagePath: "scenes/ch1/scene-1.jpg"
          },
          backgroundMusicAsset: {
            storagePath: "music/ch1/theme.mp3"
          },
          characterAppearances: [
            {
              characterId: "character-db-1",
              portrait: {
                storagePath: "portraits/ocnoer/scene-1.png"
              }
            }
          ],
          dialogueEntries: [
            {
              publicId: "entry-public-1",
              kind: DialogueKind.speech,
              orderIndex: 1,
              text: "The wind cuts through the pass.",
              promptLabel: null,
              character: {
                id: "character-db-1",
                publicId: "character-public-1",
                name: "Ocnoer",
                slug: "ocnoer",
                portraits: [{ storagePath: "portraits/ocnoer/default.png" }]
              }
            },
            {
              publicId: "entry-public-2",
              kind: DialogueKind.player_prompt,
              orderIndex: 2,
              text: "What do you say?",
              promptLabel: "Answer",
              character: null
            }
          ]
        }
      ]
    },
    {
      publicId: "chapter-public-2",
      title: "Chapter 2",
      slug: "chapter-2",
      orderIndex: 2,
      imageAsset: {
        storagePath: "chapters/ch2.jpg"
      },
      scenes: [
        {
          id: "scene-2-db",
          publicId: "scene-public-2",
          title: "Scene 2",
          orderIndex: 1,
          backgroundImageAsset: {
            storagePath: "scenes/ch2/scene-1.jpg"
          },
          backgroundMusicAsset: null,
          characterAppearances: [],
          dialogueEntries: [
            {
              publicId: "entry-public-3",
              kind: DialogueKind.narrator,
              orderIndex: 1,
              text: "Dawn breaks.",
              promptLabel: null,
              character: null
            }
          ]
        }
      ]
    }
  ]
};

describe("validateStoryForPublish", () => {
  it("reports incomplete authoring content", () => {
    expect(
      validateStoryForPublish({
        chapters: [
          {
            publicId: "chapter-public-1",
            title: "Chapter 1",
            slug: "chapter-1",
            orderIndex: 1,
            imageAsset: { storagePath: "chapters/ch1.jpg" },
            scenes: [
              {
                id: "scene-db-1",
                publicId: "scene-public-1",
                title: null,
                orderIndex: 1,
                backgroundImageAsset: { storagePath: "" },
                backgroundMusicAsset: null,
                characterAppearances: [],
                dialogueEntries: []
              }
            ]
          }
        ]
      })
    ).toEqual({
      ok: false,
      errors: [
        'Scene 1 in "Chapter 1" is missing a background image.',
        'Scene 1 in "Chapter 1" must include at least one dialogue entry.'
      ]
    });
  });
});

describe("compilePublishedStory", () => {
  it("produces a deterministic manifest and per-chapter bundles", () => {
    const compiled = compilePublishedStory({
      storyGraph: storyGraphFixture,
      bucket: "runtime",
      publishedVersionId: "version-2",
      version: 2,
      generatedAt: "2026-03-15T12:00:00.000Z",
      storagePrefix: "story/v2"
    });

    expect(compiled.manifest).toEqual({
      schemaVersion: 1,
      publishedVersionId: "version-2",
      version: 2,
      firstChapterId: "chapter-public-1",
      generatedAt: "2026-03-15T12:00:00.000Z",
      chapters: [
        {
          id: "chapter-public-1",
          slug: "chapter-1",
          title: "Chapter 1",
          orderIndex: 1,
          bundleStoragePath: "runtime/story/v2/chapters/chapter-public-1.json"
        },
        {
          id: "chapter-public-2",
          slug: "chapter-2",
          title: "Chapter 2",
          orderIndex: 2,
          bundleStoragePath: "runtime/story/v2/chapters/chapter-public-2.json"
        }
      ]
    });

    expect(compiled.manifestStoragePath).toBe("runtime/story/v2/manifest.json");
    expect(compiled.chapterBundles).toHaveLength(2);
    expect(compiled.chapterBundles[0]).toEqual({
      chapterId: "chapter-public-1",
      bundleStoragePath: "runtime/story/v2/chapters/chapter-public-1.json",
      bundle: {
        schemaVersion: 1,
        publishedVersionId: "version-2",
        version: 2,
        generatedAt: "2026-03-15T12:00:00.000Z",
        chapter: {
          id: "chapter-public-1",
          title: "Chapter 1",
          slug: "chapter-1",
          orderIndex: 1,
          imagePath: "chapters/ch1.jpg",
          scenes: [
            {
              id: "scene-public-1",
              title: "Scene 1",
              orderIndex: 1,
              media: {
                backgroundImagePath: "scenes/ch1/scene-1.jpg",
                backgroundMusicPath: "music/ch1/theme.mp3"
              },
              entries: [
                {
                  id: "entry-public-1",
                  kind: DialogueKind.speech,
                  orderIndex: 1,
                  text: "The wind cuts through the pass.",
                  promptLabel: null,
                  character: {
                    id: "character-public-1",
                    name: "Ocnoer",
                    slug: "ocnoer",
                    portraitPath: "portraits/ocnoer/scene-1.png"
                  }
                },
                {
                  id: "entry-public-2",
                  kind: DialogueKind.player_prompt,
                  orderIndex: 2,
                  text: "What do you say?",
                  promptLabel: "Answer",
                  character: null
                }
              ]
            }
          ]
        },
        nextChapterId: "chapter-public-2"
      }
    });
  });

  it("resolves prompt context from a published chapter bundle", () => {
    const compiled = compilePublishedStory({
      storyGraph: storyGraphFixture,
      bucket: "runtime",
      publishedVersionId: "version-2",
      version: 2,
      generatedAt: "2026-03-15T12:00:00.000Z",
      storagePrefix: "story/v2"
    });
    const chapter = getManifestChapterById(compiled.manifest, "chapter-public-1");

    expect(chapter).not.toBeNull();
    expect(
      resolvePromptContext(
        compiled.chapterBundles[0].bundle,
        "scene-public-1",
        "entry-public-2"
      )
    ).toEqual({
      chapterPublicId: "chapter-public-1",
      chapterTitle: "Chapter 1",
      chapterSlug: "chapter-1",
      chapterOrderIndex: 1,
      scenePublicId: "scene-public-1",
      sceneTitle: "Scene 1",
      sceneOrderIndex: 1,
      dialogueEntryPublicId: "entry-public-2",
      promptLabel: "Answer",
      promptText: "What do you say?"
    });
  });
});
