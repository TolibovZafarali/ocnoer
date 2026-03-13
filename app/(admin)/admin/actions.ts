"use server";

import { DialogueKind } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import {
  StoryEnums,
  createChapter,
  createCharacter,
  createCharacterPortrait,
  createDialogueEntry,
  createHouse,
  createMediaAsset,
  createScene,
  deleteChapter,
  deleteCharacter,
  deleteCharacterPortrait,
  deleteDialogueEntry,
  deleteHouse,
  deleteMediaAsset,
  deleteScene,
  deleteSceneCharacterAppearance,
  updateChapter,
  updateCharacter,
  updateCharacterPortrait,
  updateDialogueEntry,
  updateHouse,
  updateMediaAsset,
  updateScene,
  upsertSceneCharacterAppearance
} from "@/lib/story/repository";
import {
  parseIntegerField,
  validateRequiredText
} from "@/lib/story/validation";

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getRequiredString(
  formData: FormData,
  key: string,
  label: string
): string {
  const value = formData.get(key);
  const validation = validateRequiredText(value, label);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  return String(value).trim();
}

function getRequiredInteger(
  formData: FormData,
  key: string,
  label: string
): number {
  const value = formData.get(key);
  const parsed = parseIntegerField(value, label);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.value;
}

function getRequiredEnum<T extends string>(
  formData: FormData,
  key: string,
  label: string,
  accepted: readonly T[]
): T {
  const value = getRequiredString(formData, key, label);

  if (!accepted.includes(value as T)) {
    throw new Error(`${label} is invalid.`);
  }

  return value as T;
}

async function enforceAdminAndRevalidate(action: () => Promise<void>) {
  await requireRole("admin");
  await action();
  revalidatePath("/admin");
}

export async function createChapterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createChapter({
      title: getRequiredString(formData, "title", "Chapter title"),
      imageAssetId: getRequiredString(formData, "imageAssetId", "Chapter image asset")
    });
  });
}

export async function updateChapterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateChapter({
      chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
      title: getRequiredString(formData, "title", "Chapter title"),
      imageAssetId: getRequiredString(formData, "imageAssetId", "Chapter image asset")
    });
  });
}

export async function deleteChapterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteChapter(getRequiredString(formData, "chapterId", "Chapter id"));
  });
}

export async function createSceneAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createScene({
      chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
      title: getOptionalString(formData, "title"),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Scene order index"
      ),
      backgroundImageAssetId: getRequiredString(
        formData,
        "backgroundImageAssetId",
        "Scene background image"
      ),
      backgroundMusicAssetId: getOptionalString(formData, "backgroundMusicAssetId")
    });
  });
}

export async function updateSceneAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateScene({
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
      title: getOptionalString(formData, "title"),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Scene order index"
      ),
      backgroundImageAssetId: getRequiredString(
        formData,
        "backgroundImageAssetId",
        "Scene background image"
      ),
      backgroundMusicAssetId: getOptionalString(formData, "backgroundMusicAssetId")
    });
  });
}

export async function deleteSceneAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteScene(getRequiredString(formData, "sceneId", "Scene id"));
  });
}

export async function createHouseAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createHouse({
      name: getRequiredString(formData, "name", "House name"),
      notes: getOptionalString(formData, "notes")
    });
  });
}

export async function updateHouseAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateHouse({
      houseId: getRequiredString(formData, "houseId", "House id"),
      name: getRequiredString(formData, "name", "House name"),
      notes: getOptionalString(formData, "notes")
    });
  });
}

export async function deleteHouseAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteHouse(getRequiredString(formData, "houseId", "House id"));
  });
}

export async function createCharacterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createCharacter({
      name: getRequiredString(formData, "name", "Character name"),
      houseId: getRequiredString(formData, "houseId", "House id"),
      bio: getOptionalString(formData, "bio"),
      notes: getOptionalString(formData, "notes")
    });
  });
}

export async function updateCharacterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateCharacter({
      characterId: getRequiredString(formData, "characterId", "Character id"),
      name: getRequiredString(formData, "name", "Character name"),
      houseId: getRequiredString(formData, "houseId", "House id"),
      bio: getOptionalString(formData, "bio"),
      notes: getOptionalString(formData, "notes")
    });
  });
}

export async function deleteCharacterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteCharacter(
      getRequiredString(formData, "characterId", "Character id")
    );
  });
}

export async function createCharacterPortraitAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createCharacterPortrait({
      characterId: getRequiredString(formData, "characterId", "Character id"),
      storagePath: getRequiredString(formData, "storagePath", "Portrait storage path"),
      label: getOptionalString(formData, "label"),
      sortOrder: getRequiredInteger(formData, "sortOrder", "Portrait order")
    });
  });
}

export async function updateCharacterPortraitAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateCharacterPortrait({
      portraitId: getRequiredString(formData, "portraitId", "Portrait id"),
      characterId: getRequiredString(formData, "characterId", "Character id"),
      storagePath: getRequiredString(formData, "storagePath", "Portrait storage path"),
      label: getOptionalString(formData, "label"),
      sortOrder: getRequiredInteger(formData, "sortOrder", "Portrait order")
    });
  });
}

export async function deleteCharacterPortraitAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteCharacterPortrait(
      getRequiredString(formData, "portraitId", "Portrait id")
    );
  });
}

export async function upsertSceneCharacterAppearanceAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await upsertSceneCharacterAppearance({
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      characterId: getRequiredString(formData, "characterId", "Character id"),
      portraitId: getOptionalString(formData, "portraitId")
    });
  });
}

export async function deleteSceneCharacterAppearanceAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteSceneCharacterAppearance({
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      characterId: getRequiredString(formData, "characterId", "Character id")
    });
  });
}

export async function createDialogueEntryAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createDialogueEntry({
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      kind: getRequiredEnum(
        formData,
        "kind",
        "Dialogue kind",
        Object.values(DialogueKind)
      ),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Dialogue order index"
      ),
      text: getRequiredString(formData, "text", "Dialogue text"),
      promptLabel: getOptionalString(formData, "promptLabel"),
      characterId: getOptionalString(formData, "characterId")
    });
  });
}

export async function updateDialogueEntryAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateDialogueEntry({
      dialogueEntryId: getRequiredString(
        formData,
        "dialogueEntryId",
        "Dialogue id"
      ),
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      kind: getRequiredEnum(
        formData,
        "kind",
        "Dialogue kind",
        Object.values(DialogueKind)
      ),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Dialogue order index"
      ),
      text: getRequiredString(formData, "text", "Dialogue text"),
      promptLabel: getOptionalString(formData, "promptLabel"),
      characterId: getOptionalString(formData, "characterId")
    });
  });
}

export async function deleteDialogueEntryAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteDialogueEntry(
      getRequiredString(formData, "dialogueEntryId", "Dialogue id")
    );
  });
}

export async function createMediaAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createMediaAsset({
      type: getRequiredEnum(
        formData,
        "type",
        "Media asset type",
        StoryEnums.mediaAssetTypes
      ),
      storagePath: getRequiredString(formData, "storagePath", "Storage path"),
      altText: getOptionalString(formData, "altText"),
      label: getOptionalString(formData, "label")
    });
  });
}

export async function updateMediaAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateMediaAsset({
      mediaAssetId: getRequiredString(formData, "mediaAssetId", "Media asset id"),
      type: getRequiredEnum(
        formData,
        "type",
        "Media asset type",
        StoryEnums.mediaAssetTypes
      ),
      storagePath: getRequiredString(formData, "storagePath", "Storage path"),
      altText: getOptionalString(formData, "altText"),
      label: getOptionalString(formData, "label")
    });
  });
}

export async function deleteMediaAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteMediaAsset(
      getRequiredString(formData, "mediaAssetId", "Media asset id")
    );
  });
}
