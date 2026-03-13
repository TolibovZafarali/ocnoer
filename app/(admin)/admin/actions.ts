"use server";

import { AssetType, DialogueKind } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import {
  createChapter,
  createCharacter,
  createDialogueEntry,
  createScene,
  createSceneAsset,
  deleteChapter,
  deleteCharacter,
  deleteDialogueEntry,
  deleteScene,
  deleteSceneAsset,
  updateChapter,
  updateCharacter,
  updateDialogueEntry,
  updateScene,
  updateSceneAsset
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
      slug: getRequiredString(formData, "slug", "Chapter slug"),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Chapter order index"
      ),
      isPublished: formData.get("isPublished") === "on"
    });
  });
}

export async function updateChapterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateChapter({
      chapterId: getRequiredString(formData, "chapterId", "Chapter id"),
      title: getRequiredString(formData, "title", "Chapter title"),
      slug: getRequiredString(formData, "slug", "Chapter slug"),
      orderIndex: getRequiredInteger(
        formData,
        "orderIndex",
        "Chapter order index"
      ),
      isPublished: formData.get("isPublished") === "on"
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
      backgroundImagePath: getOptionalString(formData, "backgroundImagePath"),
      backgroundMusicPath: getOptionalString(formData, "backgroundMusicPath")
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
      backgroundImagePath: getOptionalString(formData, "backgroundImagePath"),
      backgroundMusicPath: getOptionalString(formData, "backgroundMusicPath")
    });
  });
}

export async function deleteSceneAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteScene(getRequiredString(formData, "sceneId", "Scene id"));
  });
}

export async function createCharacterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createCharacter({
      name: getRequiredString(formData, "name", "Character name"),
      slug: getRequiredString(formData, "slug", "Character slug"),
      bio: getOptionalString(formData, "bio"),
      notes: getOptionalString(formData, "notes"),
      defaultPortraitPath: getOptionalString(formData, "defaultPortraitPath")
    });
  });
}

export async function updateCharacterAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateCharacter({
      characterId: getRequiredString(formData, "characterId", "Character id"),
      name: getRequiredString(formData, "name", "Character name"),
      slug: getRequiredString(formData, "slug", "Character slug"),
      bio: getOptionalString(formData, "bio"),
      notes: getOptionalString(formData, "notes"),
      defaultPortraitPath: getOptionalString(formData, "defaultPortraitPath")
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

export async function createSceneAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await createSceneAsset({
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      type: getRequiredEnum(
        formData,
        "type",
        "Asset type",
        Object.values(AssetType)
      ),
      storagePath: getRequiredString(formData, "storagePath", "Storage path"),
      altText: getOptionalString(formData, "altText"),
      label: getOptionalString(formData, "label")
    });
  });
}

export async function updateSceneAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await updateSceneAsset({
      sceneAssetId: getRequiredString(
        formData,
        "sceneAssetId",
        "Scene asset id"
      ),
      sceneId: getRequiredString(formData, "sceneId", "Scene id"),
      type: getRequiredEnum(
        formData,
        "type",
        "Asset type",
        Object.values(AssetType)
      ),
      storagePath: getRequiredString(formData, "storagePath", "Storage path"),
      altText: getOptionalString(formData, "altText"),
      label: getOptionalString(formData, "label")
    });
  });
}

export async function deleteSceneAssetAction(formData: FormData) {
  await enforceAdminAndRevalidate(async () => {
    await deleteSceneAsset(
      getRequiredString(formData, "sceneAssetId", "Scene asset id")
    );
  });
}
