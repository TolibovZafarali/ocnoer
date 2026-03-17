"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  setDefaultCharacterEmotion,
  updateBackgroundImageAsset,
  updateBackgroundMusicTrack,
  updateChapter,
  updateCharacter,
  updateCharacterEmotion,
  updateDialogueEntry,
  updateScene
} from "@/lib/story/repository";
import { parseIntegerField, validateRequiredText } from "@/lib/story/validation";

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

function getRequiredInteger(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  const parsed = parseIntegerField(value, label);

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
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
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

  try {
    const redirectPath = (await input.action()) ?? withStatus(
      returnTo,
      "success",
      input.successMessage
    );

    await revalidateStoryPaths([returnTo, redirectPath]);
    redirect(redirectPath);
  } catch (error) {
    redirect(withStatus(returnTo, "error", getErrorMessage(error)));
  }
}

export async function createCharacterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Character created.",
    action: async () => {
      await createCharacter({
        name: getRequiredString(formData, "name", "Character name"),
        slug: getRequiredString(formData, "slug", "Character slug"),
        bio: getOptionalString(formData, "bio"),
        initialEmotionKey: getOptionalString(formData, "initialEmotionKey"),
        initialEmotionLabel: getOptionalString(formData, "initialEmotionLabel"),
        imageFile: getRequiredFile(formData, "imageFile", "Character image")
      });
    }
  });
}

export async function updateCharacterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Character updated.",
    action: async () => {
      await updateCharacter({
        characterId: getRequiredString(formData, "characterId", "Character id"),
        name: getRequiredString(formData, "name", "Character name"),
        slug: getRequiredString(formData, "slug", "Character slug"),
        bio: getOptionalString(formData, "bio")
      });
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
    }
  });
}

export async function addCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion added.",
    action: async () => {
      await addCharacterEmotion({
        characterId: getRequiredString(formData, "characterId", "Character id"),
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key"),
        emotionLabel: getRequiredString(formData, "emotionLabel", "Emotion label"),
        imageFile: getRequiredFile(formData, "imageFile", "Emotion image")
      });
    }
  });
}

export async function updateCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion updated.",
    action: async () => {
      await updateCharacterEmotion({
        characterId: getRequiredString(formData, "characterId", "Character id"),
        emotionId: getRequiredString(formData, "emotionId", "Emotion id"),
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key"),
        emotionLabel: getRequiredString(formData, "emotionLabel", "Emotion label"),
        imageFile: getOptionalFile(formData, "imageFile")
      });
    }
  });
}

export async function setDefaultCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Default emotion updated.",
    action: async () => {
      await setDefaultCharacterEmotion({
        characterId: getRequiredString(formData, "characterId", "Character id"),
        emotionId: getRequiredString(formData, "emotionId", "Emotion id")
      });
    }
  });
}

export async function deleteCharacterEmotionAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Emotion deleted.",
    action: async () => {
      await deleteCharacterEmotion({
        characterId: getRequiredString(formData, "characterId", "Character id"),
        emotionId: getRequiredString(formData, "emotionId", "Emotion id")
      });
    }
  });
}

export async function createBackgroundImageAssetAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/assets?tab=backgrounds",
    successMessage: "Background image created.",
    action: async () => {
      await createBackgroundImageAsset({
        label: getRequiredString(formData, "label", "Asset label"),
        slug: getRequiredString(formData, "slug", "Asset slug"),
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
      await updateBackgroundImageAsset({
        assetId: getRequiredString(formData, "assetId", "Asset id"),
        label: getRequiredString(formData, "label", "Asset label"),
        slug: getRequiredString(formData, "slug", "Asset slug"),
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
      await createBackgroundMusicTrack({
        label: getRequiredString(formData, "label", "Track label"),
        slug: getRequiredString(formData, "slug", "Track slug"),
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
      await updateBackgroundMusicTrack({
        assetId: getRequiredString(formData, "assetId", "Track id"),
        label: getRequiredString(formData, "label", "Track label"),
        slug: getRequiredString(formData, "slug", "Track slug"),
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
      const chapter = await createChapter({
        title: getRequiredString(formData, "title", "Chapter title"),
        slug: getRequiredString(formData, "slug", "Chapter slug"),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Chapter order")
      });

      return withStatus(`/admin/chapters/${chapter.id}`, "success", "Chapter created.");
    }
  });
}

export async function updateChapterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter updated.",
    action: async () => {
      await updateChapter({
        chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
        title: getRequiredString(formData, "title", "Chapter title"),
        slug: getRequiredString(formData, "slug", "Chapter slug"),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Chapter order")
      });
    }
  });
}

export async function deleteChapterAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter deleted.",
    action: async () => {
      await deleteChapter(getRequiredString(formData, "chapterId", "Chapter id"));
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
      const scene = await createScene({
        chapterId,
        title: getRequiredString(formData, "title", "Scene title"),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Scene order"),
        backgroundImageAssetId: getRequiredString(
          formData,
          "backgroundImageAssetId",
          "Background image"
        ),
        backgroundMusicAssetId: getOptionalString(formData, "backgroundMusicAssetId"),
        characterIds: getCharacterIds(formData)
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${scene.id}`,
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
      await updateScene({
        chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
        sceneId: getRequiredString(formData, "sceneId", "Scene id"),
        title: getRequiredString(formData, "title", "Scene title"),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Scene order"),
        backgroundImageAssetId: getRequiredString(
          formData,
          "backgroundImageAssetId",
          "Background image"
        ),
        backgroundMusicAssetId: getOptionalString(formData, "backgroundMusicAssetId"),
        characterIds: getCharacterIds(formData)
      });
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

      return withStatus(`/admin/chapters/${chapterId}`, "success", "Scene deleted.");
    }
  });
}

export async function createDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry created.",
    action: async () => {
      await createDialogueEntry({
        chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
        sceneId: getRequiredString(formData, "sceneId", "Scene id"),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Dialogue order"),
        speakerType:
          getRequiredString(formData, "speakerType", "Speaker type") === "character"
            ? "character"
            : "narrator",
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        text: getRequiredString(formData, "text", "Dialogue text")
      });
    }
  });
}

export async function updateDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry updated.",
    action: async () => {
      await updateDialogueEntry({
        chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
        sceneId: getRequiredString(formData, "sceneId", "Scene id"),
        dialogueEntryId: getRequiredString(
          formData,
          "dialogueEntryId",
          "Dialogue entry id"
        ),
        orderIndex: getRequiredInteger(formData, "orderIndex", "Dialogue order"),
        speakerType:
          getRequiredString(formData, "speakerType", "Speaker type") === "character"
            ? "character"
            : "narrator",
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        text: getRequiredString(formData, "text", "Dialogue text")
      });
    }
  });
}

export async function deleteDialogueEntryAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Dialogue entry deleted.",
    action: async () => {
      await deleteDialogueEntry({
        chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
        sceneId: getRequiredString(formData, "sceneId", "Scene id"),
        dialogueEntryId: getRequiredString(
          formData,
          "dialogueEntryId",
          "Dialogue entry id"
        )
      });
    }
  });
}

