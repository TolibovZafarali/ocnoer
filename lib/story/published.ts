import { DialogueKind } from "@prisma/client";

import type { ReaderChapter } from "@/lib/story/repository";
import { toPublicMediaUrl } from "@/lib/story/reader";

export const PUBLISHED_STORY_SCHEMA_VERSION = 1;

export type PublishedStoryManifestChapter = {
  id: string;
  slug: string;
  title: string;
  orderIndex: number;
  bundleStoragePath: string;
};

export type PublishedStoryManifest = {
  schemaVersion: typeof PUBLISHED_STORY_SCHEMA_VERSION;
  publishedVersionId: string;
  version: number;
  firstChapterId: string | null;
  generatedAt: string;
  chapters: PublishedStoryManifestChapter[];
};

export type PublishedChapterBundle = {
  schemaVersion: typeof PUBLISHED_STORY_SCHEMA_VERSION;
  publishedVersionId: string;
  version: number;
  generatedAt: string;
  chapter: ReaderChapter;
  nextChapterId: string | null;
};

export type PublishedPromptContext = {
  chapterPublicId: string;
  chapterTitle: string;
  chapterSlug: string;
  chapterOrderIndex: number;
  scenePublicId: string;
  sceneTitle: string | null;
  sceneOrderIndex: number;
  dialogueEntryPublicId: string;
  promptLabel: string | null;
  promptText: string;
};

type AuthoringStoryGraph = {
  chapters: Array<{
    publicId: string;
    title: string;
    slug: string;
    orderIndex: number;
    imageAsset: {
      storagePath: string;
    };
    scenes: Array<{
      id: string;
      publicId: string;
      title: string | null;
      orderIndex: number;
      backgroundImageAsset: {
        storagePath: string;
      };
      backgroundMusicAsset: {
        storagePath: string;
      } | null;
      characterAppearances: Array<{
        characterId: string;
        portrait: {
          storagePath: string;
        } | null;
      }>;
      dialogueEntries: Array<{
        publicId: string;
        kind: DialogueKind;
        orderIndex: number;
        text: string;
        promptLabel: string | null;
        character: {
          id: string;
          publicId: string;
          name: string;
          slug: string;
          portraits: Array<{
            storagePath: string;
          }>;
        } | null;
      }>;
    }>;
  }>;
};

export type PublishValidationResult = {
  ok: boolean;
  errors: string[];
};

export function getPublishedManifestObjectPath(storagePrefix: string) {
  return `${storagePrefix}/manifest.json`;
}

export function getPublishedChapterBundleObjectPath(
  storagePrefix: string,
  chapterPublicId: string
) {
  return `${storagePrefix}/chapters/${chapterPublicId}.json`;
}

export function withBucketPath(bucket: string, objectPath: string) {
  return `${bucket}/${objectPath}`;
}

function resolveCharacterPortraitPath(input: {
  characterId: string;
  appearanceMap: Map<string, string | null>;
  defaultPortraitPath: string | null;
}) {
  if (input.appearanceMap.has(input.characterId)) {
    return input.appearanceMap.get(input.characterId) ?? null;
  }

  return input.defaultPortraitPath;
}

export function validateStoryForPublish(
  storyGraph: AuthoringStoryGraph
): PublishValidationResult {
  const errors: string[] = [];

  if (storyGraph.chapters.length === 0) {
    errors.push("Create at least one chapter before publishing.");
  }

  for (const chapter of storyGraph.chapters) {
    if (!chapter.publicId) {
      errors.push(`Chapter "${chapter.title}" is missing a runtime public id.`);
    }

    if (chapter.scenes.length === 0) {
      errors.push(`Chapter "${chapter.title}" must include at least one scene.`);
    }

    for (const scene of chapter.scenes) {
      if (!scene.publicId) {
        errors.push(
          `Scene ${scene.orderIndex} in "${chapter.title}" is missing a runtime public id.`
        );
      }

      if (!scene.backgroundImageAsset?.storagePath) {
        errors.push(
          `Scene ${scene.orderIndex} in "${chapter.title}" is missing a background image.`
        );
      }

      if (scene.dialogueEntries.length === 0) {
        errors.push(
          `Scene ${scene.orderIndex} in "${chapter.title}" must include at least one dialogue entry.`
        );
      }

      for (const entry of scene.dialogueEntries) {
        if (!entry.publicId) {
          errors.push(
            `A dialogue entry in scene ${scene.orderIndex} of "${chapter.title}" is missing a runtime public id.`
          );
        }

        if (entry.kind === DialogueKind.player_prompt && entry.character) {
          errors.push(
            `Prompt entry ${entry.orderIndex} in scene ${scene.orderIndex} of "${chapter.title}" cannot have a character assignment.`
          );
        }

        if (
          entry.kind !== DialogueKind.narrator &&
          entry.kind !== DialogueKind.player_prompt &&
          entry.character &&
          !entry.character.publicId
        ) {
          errors.push(
            `Character on entry ${entry.orderIndex} in scene ${scene.orderIndex} of "${chapter.title}" is missing a runtime public id.`
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function compilePublishedStory(input: {
  storyGraph: AuthoringStoryGraph;
  bucket: string;
  publishedVersionId: string;
  version: number;
  generatedAt?: string;
  storagePrefix: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sortedChapters = [...input.storyGraph.chapters].sort(
    (left, right) => left.orderIndex - right.orderIndex
  );

  const chapterBundles = sortedChapters.map((chapter, chapterIndex) => {
    const chapterData: ReaderChapter = {
      id: chapter.publicId,
      title: chapter.title,
      slug: chapter.slug,
      orderIndex: chapter.orderIndex,
      imagePath: chapter.imageAsset.storagePath,
      scenes: [...chapter.scenes]
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((scene) => {
        const appearanceMap = new Map(
          scene.characterAppearances.map((appearance) => [
            appearance.characterId,
            appearance.portrait?.storagePath ?? null
          ])
        );

        return {
          id: scene.publicId,
          title: scene.title,
          orderIndex: scene.orderIndex,
          media: {
            backgroundImagePath: scene.backgroundImageAsset.storagePath,
            backgroundMusicPath: scene.backgroundMusicAsset?.storagePath ?? null
          },
          entries: [...scene.dialogueEntries]
            .sort((left, right) => left.orderIndex - right.orderIndex)
            .map((entry) => ({
              id: entry.publicId,
              kind: entry.kind,
              orderIndex: entry.orderIndex,
              text: entry.text,
              promptLabel: entry.promptLabel,
              character: entry.character
                ? {
                    id: entry.character.publicId,
                    name: entry.character.name,
                    slug: entry.character.slug,
                    portraitPath: resolveCharacterPortraitPath({
                      characterId: entry.character.id,
                      appearanceMap,
                      defaultPortraitPath:
                        entry.character.portraits[0]?.storagePath ?? null
                    })
                  }
                : null
            }))
        };
      })
    };

    return {
      chapterId: chapter.publicId,
      bundleStoragePath: withBucketPath(
        input.bucket,
        getPublishedChapterBundleObjectPath(input.storagePrefix, chapter.publicId)
      ),
      bundle: {
        schemaVersion: PUBLISHED_STORY_SCHEMA_VERSION,
        publishedVersionId: input.publishedVersionId,
        version: input.version,
        generatedAt,
        chapter: chapterData,
        nextChapterId: sortedChapters[chapterIndex + 1]?.publicId ?? null
      } satisfies PublishedChapterBundle
    };
  });

  const manifest: PublishedStoryManifest = {
    schemaVersion: PUBLISHED_STORY_SCHEMA_VERSION,
    publishedVersionId: input.publishedVersionId,
    version: input.version,
    firstChapterId: sortedChapters[0]?.publicId ?? null,
    generatedAt,
    chapters: sortedChapters.map((chapter) => ({
      id: chapter.publicId,
      slug: chapter.slug,
      title: chapter.title,
      orderIndex: chapter.orderIndex,
      bundleStoragePath: withBucketPath(
        input.bucket,
        getPublishedChapterBundleObjectPath(input.storagePrefix, chapter.publicId)
      )
    }))
  };

  return {
    manifest,
    manifestStoragePath: withBucketPath(
      input.bucket,
      getPublishedManifestObjectPath(input.storagePrefix)
    ),
    chapterBundles
  };
}

export function getManifestChapterById(
  manifest: PublishedStoryManifest,
  chapterPublicId: string
) {
  return manifest.chapters.find((chapter) => chapter.id === chapterPublicId) ?? null;
}

export async function fetchPublishedJson<T>(
  supabaseUrl: string,
  storagePath: string
): Promise<T> {
  const url = toPublicMediaUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error("Published storage path is invalid.");
  }

  const response = await fetch(url, {
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Unable to load published artifact (${response.status}).`);
  }

  return (await response.json()) as T;
}

export function resolvePromptContext(
  bundle: PublishedChapterBundle,
  scenePublicId: string,
  dialogueEntryPublicId: string
): PublishedPromptContext | null {
  const scene = bundle.chapter.scenes.find((candidate) => candidate.id === scenePublicId);

  if (!scene) {
    return null;
  }

  const entry = scene.entries.find((candidate) => candidate.id === dialogueEntryPublicId);

  if (!entry || entry.kind !== DialogueKind.player_prompt) {
    return null;
  }

  return {
    chapterPublicId: bundle.chapter.id,
    chapterTitle: bundle.chapter.title,
    chapterSlug: bundle.chapter.slug,
    chapterOrderIndex: bundle.chapter.orderIndex,
    scenePublicId: scene.id,
    sceneTitle: scene.title,
    sceneOrderIndex: scene.orderIndex,
    dialogueEntryPublicId: entry.id,
    promptLabel: entry.promptLabel,
    promptText: entry.text
  };
}
