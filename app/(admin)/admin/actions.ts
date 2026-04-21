"use server";

import { PlayerStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/admin";
import {
  PlayerProfileError,
  createPlayerProfile,
  updatePlayerProfile,
  updatePlayerProfileStatus
} from "@/lib/player-profiles";
import {
  StoryRepositoryError,
  addCharacterEmotion,
  createCharacterDress,
  createBackgroundImageAsset,
  createBackgroundMusicTrack,
  createChapter,
  createCharacter,
  createDialogueEntry,
  createScene,
  discardSceneDraft,
  deleteBackgroundImageAsset,
  deleteBackgroundMusicTrack,
  deleteChapter,
  deleteCharacter,
  deleteCharacterDress,
  deleteCharacterDressEmotionOverride,
  deleteCharacterEmotion,
  deleteDialogueEntry,
  deleteScene,
  getAdminStoryData,
  isSceneDraftStorageUnavailableError,
  saveSceneDraft,
  reorderDialogueEntry,
  setDefaultCharacterEmotion,
  upsertCharacterDressEmotionOverride,
  upsertSceneDraft,
  updateBackgroundImageAsset,
  updateBackgroundMusicTrack,
  updateChapter,
  updateCharacter,
  updateCharacterDress,
  updateCharacterEmotion,
  updateDialogueEntry,
  updateScene
} from "@/lib/story/repository";
import type { SceneDraftPayload } from "@/lib/story/types";
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

function getOptionalBoolean(formData: FormData, key: string) {
  const values = formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  const normalized = values[values.length - 1];

  return normalized === "on" || normalized === "true" || normalized === "yes";
}

function getRequiredInteger(
  formData: FormData,
  key: string,
  label: string,
  options?: {
    min?: number;
  }
) {
  const value = getOptionalInteger(formData, key, label, options);

  if (value == null) {
    throw new StoryRepositoryError(`${label} is required.`);
  }

  return value;
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

function getDressOptionKeys(formData: FormData) {
  return formData
    .getAll("dressOptionKeys")
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

function toRevalidationPath(path: string) {
  return new URL(path, "https://ocnoer.local").pathname;
}

function getErrorMessage(error: unknown) {
  if (error instanceof StoryRepositoryError) {
    return error.message;
  }

  if (error instanceof PlayerProfileError) {
    return error.message;
  }

  return "Unable to save content right now.";
}

function getNextOrderIndex(items: Array<{ orderIndex: number }>) {
  return (
    items.reduce((highest, item) => Math.max(highest, item.orderIndex), 0) + 1
  );
}

function getDialogueSpeakerType(formData: FormData) {
  const speakerType = getRequiredString(
    formData,
    "speakerType",
    "Speaker type"
  );

  if (
    speakerType !== "narrator" &&
    speakerType !== "character" &&
    speakerType !== "dress_prompt" &&
    speakerType !== "cat_name_prompt"
  ) {
    throw new StoryRepositoryError("Speaker type is invalid.");
  }

  return speakerType;
}

function getDialogueText(
  formData: FormData,
  speakerType: ReturnType<typeof getDialogueSpeakerType>
) {
  if (speakerType === "cat_name_prompt") {
    return getOptionalString(formData, "text") ?? "";
  }

  return getRequiredString(formData, "text", "Dialogue text");
}

function getPlayerStatus(formData: FormData) {
  const statusValue = getRequiredString(formData, "status", "Player status");

  if (
    statusValue !== PlayerStatus.ACTIVE &&
    statusValue !== PlayerStatus.INACTIVE
  ) {
    throw new PlayerProfileError("Player status is invalid.");
  }

  return statusValue;
}

export type AdminRedirectActionState = {
  error: string | null;
  redirectTo: string | null;
};

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
  const uniquePathnames = [
    ...new Set(["/admin", "/play", ...pathnames.map(toRevalidationPath)])
  ];

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

async function runAdminNavigationAction(input: {
  formData: FormData;
  fallbackPath: string;
  successMessage: string;
  action: () => Promise<string | void>;
}): Promise<AdminRedirectActionState> {
  await requireAdminSession();

  const returnTo = getReturnTo(input.formData, input.fallbackPath);

  try {
    const redirectTo =
      (await input.action()) ??
      withStatus(returnTo, "success", input.successMessage);

    await revalidateStoryPaths([returnTo, redirectTo]);

    return {
      error: null,
      redirectTo
    };
  } catch (error) {
    unstable_rethrow(error);

    return {
      error: getErrorMessage(error),
      redirectTo: null
    };
  }
}

export type SceneDraftActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type UpsertSceneDraftActionInput = {
  chapterId: string;
  sceneId: string;
  sourceSceneUpdatedAt: string;
  payload: SceneDraftPayload;
};

export type SaveSceneDraftActionInput = UpsertSceneDraftActionInput & {
  returnTo: string;
};

export type SaveSceneDraftActionResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

export type DiscardSceneDraftActionInput = {
  sceneId: string;
  returnTo: string;
};

export async function upsertSceneDraftAction(
  input: UpsertSceneDraftActionInput
): Promise<SceneDraftActionResult> {
  await requireAdminSession();

  try {
    await upsertSceneDraft({
      sceneId: input.sceneId,
      chapterId: input.chapterId,
      sourceSceneUpdatedAt: input.sourceSceneUpdatedAt,
      payload: input.payload
    });

    return {
      ok: true
    };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      error: getErrorMessage(error)
    };
  }
}

export async function saveSceneDraftAction(
  input: SaveSceneDraftActionInput
): Promise<SaveSceneDraftActionResult> {
  await requireAdminSession();

  try {
    try {
      await upsertSceneDraft({
        sceneId: input.sceneId,
        chapterId: input.chapterId,
        sourceSceneUpdatedAt: input.sourceSceneUpdatedAt,
        payload: input.payload
      });
    } catch (error) {
      if (!isSceneDraftStorageUnavailableError(error)) {
        throw error;
      }
    }

    await saveSceneDraft({
      chapterId: input.chapterId,
      sceneId: input.sceneId,
      payload: input.payload
    });

    await revalidateStoryPaths([
      input.returnTo,
      `/admin/chapters/${input.chapterId}/scenes`
    ]);

    return {
      ok: true,
      redirectTo: withStatus(input.returnTo, "success", "Scene saved.")
    };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      error: getErrorMessage(error)
    };
  }
}

export async function discardSceneDraftAction(
  input: DiscardSceneDraftActionInput
): Promise<SaveSceneDraftActionResult> {
  await requireAdminSession();

  try {
    await discardSceneDraft(input.sceneId);

    return {
      ok: true,
      redirectTo: withStatus(input.returnTo, "success", "Draft discarded.")
    };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      error: getErrorMessage(error)
    };
  }
}

export async function createCharacterNavigationAction(
  _previousState: AdminRedirectActionState,
  formData: FormData
) {
  return runAdminNavigationAction({
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

export async function createChapterNavigationAction(
  _previousState: AdminRedirectActionState,
  formData: FormData
) {
  return runAdminNavigationAction({
    formData,
    fallbackPath: "/admin/chapters",
    successMessage: "Chapter created.",
    action: async () => {
      const title = getRequiredString(formData, "title", "Chapter title");
      const chapter = await createChapter({
        title,
        slug: getOptionalString(formData, "slug") ?? title,
        orderIndex: await resolveChapterOrderIndex(formData),
        openingCardText: null,
        endingCardText: null
      });

      return withStatus(
        `/admin/chapters/${chapter.id}/scenes`,
        "success",
        "Chapter created."
      );
    }
  });
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

export async function createCharacterDressAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Dress added.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await createCharacterDress({
        characterId,
        dressKey: getRequiredString(formData, "dressKey", "Dress key"),
        dressLabel: getRequiredString(formData, "dressLabel", "Dress label")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Dress added."
      );
    }
  });
}

export async function updateCharacterDressAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Dress updated.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await updateCharacterDress({
        characterId,
        dressId: getRequiredString(formData, "dressId", "Dress id"),
        dressKey: getRequiredString(formData, "dressKey", "Dress key"),
        dressLabel: getRequiredString(formData, "dressLabel", "Dress label")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Dress updated."
      );
    }
  });
}

export async function deleteCharacterDressAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Dress deleted.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await deleteCharacterDress({
        characterId,
        dressId: getRequiredString(formData, "dressId", "Dress id")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Dress deleted."
      );
    }
  });
}

export async function upsertCharacterDressEmotionOverrideAction(
  formData: FormData
) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Dress image updated.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await upsertCharacterDressEmotionOverride({
        characterId,
        dressId: getRequiredString(formData, "dressId", "Dress id"),
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key"),
        imageFile: getRequiredFile(formData, "imageFile", "Dress image")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Dress image updated."
      );
    }
  });
}

export async function deleteCharacterDressEmotionOverrideAction(
  formData: FormData
) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/characters",
    successMessage: "Dress image removed.",
    action: async () => {
      const characterId = getRequiredString(
        formData,
        "characterId",
        "Character id"
      );

      await deleteCharacterDressEmotionOverride({
        characterId,
        dressId: getRequiredString(formData, "dressId", "Dress id"),
        emotionKey: getRequiredString(formData, "emotionKey", "Emotion key")
      });

      return withStatus(
        `/admin/characters/${characterId}`,
        "success",
        "Dress image removed."
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
        orderIndex: await resolveChapterOrderIndex(formData),
        openingCardText: null,
        endingCardText: null
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
          }) ?? (await resolveExistingChapterOrderIndex(chapterId)),
        openingCardText: getOptionalString(formData, "openingCardText"),
        endingCardText: getOptionalString(formData, "endingCardText")
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
        backgroundImageAssetId: getOptionalString(
          formData,
          "backgroundImageAssetId"
        ),
        backgroundMusicAssetId: getOptionalString(
          formData,
          "backgroundMusicAssetId"
        ),
        carryOcnoerDressSelection:
          getOptionalBoolean(formData, "carryOcnoerDressSelection") ?? true,
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
        backgroundImageAssetId: getOptionalString(
          formData,
          "backgroundImageAssetId"
        ),
        backgroundMusicAssetId: getOptionalString(
          formData,
          "backgroundMusicAssetId"
        ),
        carryOcnoerDressSelection:
          getOptionalBoolean(formData, "carryOcnoerDressSelection") ?? true,
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
      const speakerType = getDialogueSpeakerType(formData);

      await createDialogueEntry({
        chapterId,
        sceneId,
        speakerType,
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        dressOptionKeys: getDressOptionKeys(formData),
        text: getDialogueText(formData, speakerType)
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
      const speakerType = getDialogueSpeakerType(formData);
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
        speakerType,
        characterId: getOptionalString(formData, "characterId"),
        emotionKey: getOptionalString(formData, "emotionKey"),
        dressOptionKeys: getDressOptionKeys(formData),
        text: getDialogueText(formData, speakerType)
      });

      return withStatus(
        `/admin/chapters/${chapterId}/scenes/${sceneId}`,
        "success",
        "Dialogue entry updated."
      );
    }
  });
}

export type ReorderDialogueEntryActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export async function reorderDialogueEntryAction(
  formData: FormData
): Promise<ReorderDialogueEntryActionResult> {
  await requireAdminSession();

  try {
    const chapterId = getRequiredString(formData, "chapterId", "Chapter id");
    const sceneId = getRequiredString(formData, "sceneId", "Scene id");
    const dialogueEntryId = getRequiredString(
      formData,
      "dialogueEntryId",
      "Dialogue entry id"
    );
    const targetOrderIndex = getRequiredInteger(
      formData,
      "targetOrderIndex",
      "Dialogue target order",
      {
        min: 1
      }
    );

    await reorderDialogueEntry({
      chapterId,
      sceneId,
      dialogueEntryId,
      targetOrderIndex
    });

    await revalidateStoryPaths([
      `/admin/chapters/${chapterId}/scenes/${sceneId}`
    ]);

    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      message: getErrorMessage(error)
    };
  }
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

export async function createPlayerProfileAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/players",
    successMessage: "Player created.",
    action: async () => {
      await createPlayerProfile({
        firstName: getRequiredString(formData, "firstName", "First name"),
        username: getRequiredString(formData, "username", "Username"),
        catName: getOptionalString(formData, "catName"),
        status: getPlayerStatus(formData)
      });
    }
  });
}

export async function updatePlayerProfileAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/players",
    successMessage: "Player updated.",
    action: async () => {
      const playerId = getRequiredString(formData, "playerId", "Player id");

      await updatePlayerProfile({
        playerId,
        firstName: getRequiredString(formData, "firstName", "First name"),
        username: getRequiredString(formData, "username", "Username"),
        catName: getOptionalString(formData, "catName"),
        status: getPlayerStatus(formData)
      });
    }
  });
}

export async function updatePlayerProfileStatusAction(formData: FormData) {
  await runAdminAction({
    formData,
    fallbackPath: "/admin/players",
    successMessage: "Player status updated.",
    action: async () => {
      await updatePlayerProfileStatus({
        playerId: getRequiredString(formData, "playerId", "Player id"),
        status: getPlayerStatus(formData)
      });
    }
  });
}
