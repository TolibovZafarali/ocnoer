"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/admin";
import {
  StoryRepositoryError,
  addCharacterEmotion,
  createBackgroundImageAsset,
  createBackgroundMusicTrack,
  createChapter,
  createCharacter,
  createDialogueEntry,
  createScene,
  deleteBackgroundImageAsset,
  deleteBackgroundMusicTrack,
  deleteChapter,
  deleteCharacter,
  deleteCharacterEmotion,
  deleteDialogueEntry,
  deleteScene,
  getAdminStoryData,
  setDefaultCharacterEmotion,
  updateBackgroundImageAsset,
  updateBackgroundMusicTrack,
  updateChapter,
  updateCharacter,
  updateCharacterEmotion,
  updateDialogueEntry,
  updateScene
} from "@/lib/story/repository";
import {
  parseIntegerField,
  validateRequiredText
} from "@/lib/story/validation";

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function getRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  const validation = validateRequiredText(value, label);

  if (!validation.ok) {
    throw new StoryRepositoryError(validation.message);
  }

  return String(value).trim();
}

function getOptionalInteger(
  formData: FormData,
  key: string,
  label: string,
  options?: {
    min?: number;
  }
) {
  const value = formData.get(key);

  if (value == null || value === "") {
    return null;
  }

  const parsed = parseIntegerField(value, label, options);

  if (!parsed.ok) {
    throw new StoryRepositoryError(parsed.message);
  }

  return parsed.value;
}

function getOptionalFile(formData: FormData, key: string) {
  const value = formData.get(key);

  return value instanceof File && value.size > 0 ? value : null;
}

function getRequiredFile(formData: FormData, key: string, label: string) {
  const file = getOptionalFile(formData, key);

  if (!file) {
    throw new StoryRepositoryError(`${label} is required.`);
  }

  return file;
}

function getCharacterIds(formData: FormData) {
  return formData
    .getAll("characterIds")
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    )
    .map((value) => value.trim());
}

function getReturnTo(formData: FormData, fallback: string) {
  return getOptionalString(formData, "returnTo") ?? fallback;
}

function withStatus(path: string, kind: "success" | "error", message: string) {
  const url = new URL(path, "https://ocnoer.local");

  url.searchParams.set("status", kind);
  url.searchParams.set("message", message);

  return `${url.pathname}${url.search}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof StoryRepositoryError) {
    return error.message;
  }

  return "Unable to save content right now.";
}

function getNextOrderIndex(items: Array<{ orderIndex: number }>) {
  return (
    items.reduce((highest, item) => Math.max(highest, item.orderIndex), 0) + 1
  );
}

async function resolveChapterOrderIndex(formData: FormData) {
  const explicit = getOptionalInteger(formData, "orderIndex", "Chapter order", {
    min: 1
  });

  if (explicit != null) {
    return explicit;
  }

  const story = await getAdminStoryData();

  return getNextOrderIndex(story.chapters);
}

async function resolveExistingChapterOrderIndex(chapterId: string) {
  const story = await getAdminStoryData();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    throw new StoryRepositoryError("Chapter not found.");
  }

  return chapter.orderIndex;
}

async function resolveSceneOrderIndex(formData: FormData, chapterId: string) {
  const explicit = getOptionalInteger(formData, "orderIndex", "Scene order", {
    min: 1
  });

  if (explicit != null) {
    return explicit;
  }

  const story = await getAdminStoryData();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    throw new StoryRepositoryError("Chapter not found.");
  }

  return getNextOrderIndex(chapter.scenes);
}

async function resolveExistingSceneOrderIndex(
  chapterId: string,
  sceneId: string
) {
  const story = await getAdminStoryData();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    throw new StoryRepositoryError("Scene not found.");
  }

  return scene.orderIndex;
}

async function resolveDialogueOrderIndex(
  formData: FormData,
  chapterId: string,
  sceneId: string
) {
  const explicit = getOptionalInteger(
    formData,
    "orderIndex",
    "Dialogue order",
    {
      min: 1
    }
  );

  if (explicit != null) {
    return explicit;
  }

  const story = await getAdminStoryData();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    throw new StoryRepositoryError("Scene not found.");
  }

  return getNextOrderIndex(scene.dialogue);
}

async function resolveExistingDialogueOrderIndex(
  chapterId: string,
  sceneId: string,
  dialogueEntryId: string
) {
  const story = await getAdminStoryData();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;
  const entry =
    scene?.dialogue.find((item) => item.id === dialogueEntryId) ?? null;

  if (!chapter || !scene || !entry) {
    throw new StoryRepositoryError("Dialogue entry not found.");
  }

  return entry.orderIndex;
}

async function revalidateStoryPaths(pathnames: string[]) {
  const uniquePathnames = [...new Set(["/admin", "/play", ...pathnames])];

  uniquePathnames.forEach((pathname) => {
    try {
      revalidatePath(pathname);
    } catch {
      // Best-effort revalidation for route variants.
    }
  });
}

async function runAdminAction(input: {
  formData: FormData;
  fallbackPath: string;
  successMessage: string;
  action: () => Promise<string | void>;
}) {
  await requireAdminSession();

  const returnTo = getReturnTo(input.formData, input.fallbackPath);
  let redirectPath: string;

  try {
    redirectPath =
      (await input.action()) ??
      withStatus(returnTo, "success", input.successMessage);

    await revalidateStoryPaths([returnTo, redirectPath]);
  } catch (error) {
    unstable_rethrow(error);
    redirectPath = withStatus(returnTo, "error", getErrorMessage(error));
  }

  redirect(redirectPath);
}

export async function createCharacterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Character created.",
    action: async () => {
      const name = getRequiredString(formData, "name", "Character name");
      const character = await createCharacter({
        name,
        slug: getOptionalString(formData, "slug") ?? name,
        bio: getOptionalString(formData, "bio"),
        initialEmotionKey: getOptionalString(formData, "initialEmotionKey"),
        initialEmotionLabel: getOptionalString(formData, "initialEmotionLabel"),
        imageFile: getRequiredFile(formData, "imageFile", "Character image")
      });

      return withStatus(
        `/admin/characters/${character.id}`,
        "success",
        "Character created."
      );
    }
  });
}

export async function updateCharacterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Character updated.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );
      const name = getRequiredString(formData, "name", "Character name");

      await updateCharacter({
        characterId,
        name,
        slug: getOptionalString(formData, "slug") ?? name,
        bio: getOptionalString(formData, "bio")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Character updated."
      );
    }
  });
}

export async function deleteCharacterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Character deleted.",
    action: async () => {
      await deleteCharacter(
        getRequiredString(formData, "characterId", "Character id")
      );

      return withStatus("/admin/characters", "success", "Character deleted.");
    }
  });
}

export async function addCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion added.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await addCharacterEmotion({
        characterId,
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key"),
        emotionLabel: getRequiredString(
          formData,
          "emotionLabel",
          "Emotion label"
        ),
        imageFile: getRequiredFile(formData, "imageFile", "Emotion image")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Emotion added."
      );
    }
  });
}

export async function updateCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion updated.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await updateCharacterEmotion({
        characterId,
        emotionId: getRequiredString(formData, "emotionId", "Emotion id"),
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key"),
        emotionLabel: getRequiredString(
          formData,
          "emotionLabel",
          "Emotion label"
        ),
        imageFile: getOptionalFile(formData, "imageFile")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Emotion updated."
      );
    }
  });
}

export async function setDefaultCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Default emotion updated.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await setDefaultCharacterEmotion({
        characterId,
        emotionId: getRequiredString(formData, "emotionId", "Emotion id")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Default emotion updated."
      );
    }
  });
}

export async function deleteCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion deleted.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await deleteCharacterEmotion({
        characterId,
        emotionId: getRequiredString(formData, "emotionId", "Emotion id")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Emotion deleted."
      );
    }
  });
}

export async function createBackgroundImageAssetAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=backgrounds",
    successMessage: "Background image created.",
    action: async () => {
      const label = getRequiredString(formData, "label", "Asset label");

      await createBackgroundImageAsset({
        label,
        slug: getOptionalString(formData, "slug") ?? label,
        altText: getOptionalString(formData, "altText"),
        file: getRequiredFile(formData, "file", "Background image")
      });
    }
  });
}

export async function updateBackgroundImageAssetAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=backgrounds",
    successMessage: "Background image updated.",
    action: async () => {
      const label = getRequiredString(formData, "label", "Asset label");

      await updateBackgroundImageAsset({
        assetId: getRequiredString(formData, "assetId", "Asset id"),
        label,
        slug: getOptionalString(formData, "slug") ?? label,
        altText: getOptionalString(formData, "altText"),
        file: getOptionalFile(formData, "file")
      });
    }
  });
}

export async function deleteBackgroundImageAssetAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=backgrounds",
    successMessage: "Background image deleted.",
    action: async () => {
      await deleteBackgroundImageAsset(
        getRequiredString(formData, "assetId", "Asset id")
      );
    }
  });
}

export async function createBackgroundMusicTrackAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=music",
    successMessage: "Music track created.",
    action: async () => {
      const label = getRequiredString(formData, "label", "Track label");

      await createBackgroundMusicTrack({
        label,
        slug: getOptionalString(formData, "slug") ?? label,
        file: getRequiredFile(formData, "file", "Music file")
      });
    }
  });
}

export async function updateBackgroundMusicTrackAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=music",
    successMessage: "Music track updated.",
    action: async () => {
      const label = getRequiredString(formData, "label", "Track label");

      await updateBackgroundMusicTrack({
        assetId: getRequiredString(formData, "assetId", "Track id"),
        label,
        slug: getOptionalString(formData, "slug") ?? label,
        file: getOptionalFile(formData, "file")
      });
    }
  });
}

export async function deleteBackgroundMusicTrackAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=music",
    successMessage: "Music track deleted.",
    action: async () => {
      await deleteBackgroundMusicTrack(
        getRequiredString(formData, "assetId", "Track id")
      );
    }
  });
}

export async function createChapterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter created.",
    action: async () => {
      const title = getRequiredString(formData, "title", "Chapter title");
      const chapter = await createChapter({
        title,
        slug: getOptionalString(formData, "slug") ?? title,
        orderIndex: await resolveChapterOrderIndex(formData)
      });

      return withStatus(
        `/admin/chapters/${chapter.id}/scenes`,
        "success",
        "Chapter created."
      );
    }
  });
}

export async function updateChapterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter updated.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
      const title = getRequiredString(formData, "title", "Chapter title");

      await updateChapter({
        chapterId,
        title,
        slug: getOptionalString(formData, "slug") ?? title,
        orderIndex:
          getOptionalInteger(formData, "orderIndex", "Chapter order", {
            min: 1
          }) ?? (await resolveExistingChapterOrderIndex(chapterId))
      });

      return withStatus(
        `/admin/chapters/${chapterId}/settings`,
        "success",
        "Chapter updated."
      );
    }
  });
}

export async function deleteChapterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter deleted.",
    action: async () => {
      await deleteChapter(
        getRequiredString(formData, "chapterId", "Chapter id")
      );

      return withStatus("/admin/chapters", "success", "Chapter deleted.");
    }
  });
}

export async function createSceneAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Scene created.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");

      await createScene({
        chapterId,
        title: getRequiredString(formData, "title", "Scene title"),
        orderIndex: await resolveSceneOrderIndex(formData, chapterId),
        backgroundImageAssetId: getRequiredString(
          formData,
          "backgroundImageAssetId",
          "Background image"
        ),
        backgroundMusicAssetId: getOptionalString(
          formData,
          "backgroundMusicAssetId"
        ),
        characterIds: getCharacterIds(formData)
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes`,
        "success",
        "Scene created."
      );
    }
  });
}

export async function updateSceneAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Scene updated.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
      const sceneId = getRequiredString(formData, "sceneId", "Scene id");

      await updateScene({
        chapterId,
        sceneId,
        title: getRequiredString(formData, "title", "Scene title"),
        orderIndex:
          getOptionalInteger(formData, "orderIndex", "Scene order", {
            min: 1
          }) ?? (await resolveExistingSceneOrderIndex(chapterId, sceneId)),
        backgroundImageAssetId: getRequiredString(
          formData,
          "backgroundImageAssetId",
          "Background image"
        ),
        backgroundMusicAssetId: getOptionalString(
          formData,
          "backgroundMusicAssetId"
        ),
        characterIds: getCharacterIds(formData)
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${sceneId}`,
        "success",
        "Scene updated."
      );
    }
  });
}

export async function deleteSceneAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Scene deleted.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");

      await deleteScene({
        chapterId,
        sceneId: getRequiredString(formData, "sceneId", "Scene id")
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes`,
        "success",
        "Scene deleted."
      );
    }
  });
}

export async function createDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry created.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
      const sceneId = getRequiredString(formData, "sceneId", "Scene id");

      await createDialogueEntry({
        chapterId,
        sceneId,
        orderIndex: await resolveDialogueOrderIndex(
          formData,
          chapterId,
          sceneId
        ),
        speakerType:
          getRequiredString(formData, "speakerType", "Speaker type") ===
          "character"
            ? "character"
            : "narrator",
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        text: getRequiredString(formData, "text", "Dialogue text")
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${sceneId}`,
        "success",
        "Dialogue entry created."
      );
    }
  });
}

export async function updateDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry updated.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
      const sceneId = getRequiredString(formData, "sceneId", "Scene id");
      const dialogueEntryId = getRequiredString(
        formData,
        "dialogueEntryId",
        "Dialogue entry id"
      );

      await updateDialogueEntry({
        chapterId,
        sceneId,
        dialogueEntryId,
        orderIndex:
          getOptionalInteger(formData, "orderIndex", "Dialogue order", {
            min: 1
          }) ??
          (await resolveExistingDialogueOrderIndex(
            chapterId,
            sceneId,
            dialogueEntryId
          )),
        speakerType:
          getRequiredString(formData, "speakerType", "Speaker type") ===
          "character"
            ? "character"
            : "narrator",
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        text: getRequiredString(formData, "text", "Dialogue text")
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${sceneId}`,
        "success",
        "Dialogue entry updated."
      );
    }
  });
}

export async function deleteDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry deleted.",
    action: async () => {
      const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
      const sceneId = getRequiredString(formData, "sceneId", "Scene id");

      await deleteDialogueEntry({
        chapterId,
        sceneId,
        dialogueEntryId: getRequiredString(
          formData,
          "dialogueEntryId",
          "Dialogue entry id"
        )
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${sceneId}`,
        "success",
        "Dialogue entry deleted."
      );
    }
  });
}
