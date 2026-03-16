import {
  fetchPublishedJson,
  getManifestChapterById,
  resolvePromptContext,
  type PublishedChapterBundle,
  type PublishedStoryManifest
} from "@/lib/story/published";
import {
  getPublishedStoryVersionById,
  getReaderBootstrapData,
  StoryRepositoryError
} from "@/lib/story/repository";
import { getSupabaseEnv } from "@/lib/supabase/env";

export class PublishedRuntimeError extends Error {}

export type ReaderCheckpoint = {
  publishedVersionId: string;
  chapterPublicId: string;
  scenePublicId: string;
  dialogueEntryPublicId: string;
  lastReadAt: string;
};

export type PlayerRuntimeBootstrap = {
  userId: string;
  pinnedVersionId: string;
  pinnedVersionNumber: number;
  manifest: PublishedStoryManifest;
  initialBundle: PublishedChapterBundle;
  serverCheckpoint: ReaderCheckpoint | null;
};

async function loadPublishedJson<T>(storagePath: string) {
  const { url } = getSupabaseEnv();

  return fetchPublishedJson<T>(url, storagePath);
}

export async function loadPublishedManifest(storagePath: string) {
  return loadPublishedJson<PublishedStoryManifest>(storagePath);
}

export async function loadPublishedChapterBundle(storagePath: string) {
  return loadPublishedJson<PublishedChapterBundle>(storagePath);
}

export async function getPlayerRuntimeBootstrap(
  userEmail: string
): Promise<PlayerRuntimeBootstrap | null> {
  try {
    const bootstrapData = await getReaderBootstrapData(userEmail);

    if (!bootstrapData.publishedVersion) {
      return null;
    }

    const manifest = await loadPublishedManifest(
      bootstrapData.publishedVersion.manifestStoragePath
    );
    const initialChapterId =
      bootstrapData.progress?.chapterPublicId ?? manifest.firstChapterId;

    if (!initialChapterId) {
      return null;
    }

    const initialChapter = getManifestChapterById(manifest, initialChapterId);
    const fallbackChapter =
      initialChapter ??
      (manifest.firstChapterId
        ? getManifestChapterById(manifest, manifest.firstChapterId)
        : null);

    if (!fallbackChapter) {
      return null;
    }

    const initialBundle = await loadPublishedChapterBundle(
      fallbackChapter.bundleStoragePath
    );

    return {
      userId: bootstrapData.user.id,
      pinnedVersionId: bootstrapData.publishedVersion.id,
      pinnedVersionNumber: bootstrapData.publishedVersion.version,
      manifest,
      initialBundle,
      serverCheckpoint: bootstrapData.progress
        ? {
            publishedVersionId: bootstrapData.progress.publishedVersionId,
            chapterPublicId: bootstrapData.progress.chapterPublicId,
            scenePublicId: bootstrapData.progress.scenePublicId,
            dialogueEntryPublicId:
              bootstrapData.progress.dialogueEntryPublicId,
            lastReadAt: bootstrapData.progress.lastReadAt.toISOString()
          }
        : null
    };
  } catch (error) {
    if (error instanceof StoryRepositoryError) {
      throw new PublishedRuntimeError(error.message);
    }

    throw new PublishedRuntimeError(
      "Unable to load the published story runtime."
    );
  }
}

export async function getPublishedPromptContext(input: {
  publishedVersionId: string;
  chapterPublicId: string;
  scenePublicId: string;
  dialogueEntryPublicId: string;
}) {
  try {
    const publishedVersion = await getPublishedStoryVersionById(
      input.publishedVersionId
    );

    if (!publishedVersion) {
      throw new PublishedRuntimeError(
        "Published story version is no longer available."
      );
    }

    const manifest = await loadPublishedManifest(
      publishedVersion.manifestStoragePath
    );
    const chapter = getManifestChapterById(manifest, input.chapterPublicId);

    if (!chapter) {
      throw new PublishedRuntimeError(
        "Published chapter is no longer available for this prompt."
      );
    }

    const bundle = await loadPublishedChapterBundle(chapter.bundleStoragePath);
    const promptContext = resolvePromptContext(
      bundle,
      input.scenePublicId,
      input.dialogueEntryPublicId
    );

    if (!promptContext) {
      throw new PublishedRuntimeError(
        "Prompt context is invalid or no longer available."
      );
    }

    return promptContext;
  } catch (error) {
    if (error instanceof PublishedRuntimeError) {
      throw error;
    }

    if (error instanceof StoryRepositoryError) {
      throw new PublishedRuntimeError(error.message);
    }

    throw new PublishedRuntimeError(
      "Unable to resolve the published prompt context."
    );
  }
}
