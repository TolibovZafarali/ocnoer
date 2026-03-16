import { randomUUID } from "node:crypto";

import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import {
  compilePublishedStory,
  validateStoryForPublish
} from "@/lib/story/published";
import {
  activatePublishedStoryVersion,
  createPublishedStoryVersion,
  getAdminStoryGraph,
  getPublishedStoryVersionById,
  getNextPublishedStoryVersionNumber,
  StoryRepositoryError
} from "@/lib/story/repository";

export class StoryPublishError extends Error {}

function createPublishedVersionId() {
  return `published_${randomUUID().replace(/-/g, "")}`;
}

function toJsonBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

async function uploadPublishedArtifact(
  bucket: string,
  objectPath: string,
  value: unknown
) {
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(
    objectPath,
    toJsonBuffer(value),
    {
      contentType: "application/json; charset=utf-8",
      upsert: false,
      cacheControl: "31536000"
    }
  );

  if (error) {
    throw new StoryPublishError(error.message);
  }
}

export async function publishStory() {
  try {
    const storyGraph = await getAdminStoryGraph();
    const validation = validateStoryForPublish(storyGraph);

    if (!validation.ok) {
      throw new StoryPublishError(validation.errors.join(" "));
    }

    const version = await getNextPublishedStoryVersionNumber();
    const publishedVersionId = createPublishedVersionId();
    const { runtimeBucket } = getSupabaseServerEnv();
    const storagePrefix = `story/v${version}`;
    const compiledStory = compilePublishedStory({
      storyGraph,
      bucket: runtimeBucket,
      publishedVersionId,
      version,
      storagePrefix
    });

    await uploadPublishedArtifact(
      runtimeBucket,
      `${storagePrefix}/manifest.json`,
      compiledStory.manifest
    );

    for (const chapterBundle of compiledStory.chapterBundles) {
      await uploadPublishedArtifact(
        runtimeBucket,
        `${storagePrefix}/chapters/${chapterBundle.chapterId}.json`,
        chapterBundle.bundle
      );
    }

    return await createPublishedStoryVersion({
      id: publishedVersionId,
      version,
      manifestStoragePath: compiledStory.manifestStoragePath,
      storagePrefix
    });
  } catch (error) {
    if (error instanceof StoryPublishError) {
      throw error;
    }

    if (error instanceof StoryRepositoryError) {
      throw new StoryPublishError(error.message);
    }

    throw new StoryPublishError("Unable to publish the story right now.");
  }
}

export async function rollbackPublishedStoryVersion(versionId: string) {
  try {
    const version = await getPublishedStoryVersionById(versionId);

    if (!version) {
      throw new StoryPublishError("Published story version not found.");
    }

    return await activatePublishedStoryVersion(versionId);
  } catch (error) {
    if (error instanceof StoryPublishError) {
      throw error;
    }

    if (error instanceof StoryRepositoryError) {
      throw new StoryPublishError(error.message);
    }

    throw new StoryPublishError("Unable to roll back the published story version.");
  }
}
