import { randomUUID } from "node:crypto";

import { compileRuntimeStory } from "@/lib/story/published";
import { slugify } from "@/lib/story/slug";
import type {
  AssetsCatalogFile,
  BackgroundImageAsset,
  BackgroundMusicTrack,
  ChapterDefinition,
  ChaptersCatalogFile,
  CharacterDefinition,
  CharactersCatalogFile,
  DialogueEntry,
  SceneDefinition,
  StoryAuthoringSnapshot
} from "@/lib/story/types";
import { STORY_SCHEMA_VERSION } from "@/lib/story/types";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

export class StoryRepositoryError extends Error {}

const AUTHORING_CHARACTERS_PATH = "authoring/characters.json";
const AUTHORING_ASSETS_PATH = "authoring/assets.json";
const AUTHORING_CHAPTERS_PATH = "authoring/chapters.json";
const RUNTIME_PREFIX = "runtime";

function createEntityId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function withBucketPath(objectPath: string) {
  const { runtimeBucket } = getSupabaseServerEnv();

  return `${runtimeBucket}/${objectPath}`;
}

function nowIsoString() {
  return new Date().toISOString();
}

function normalizeSlugInput(value: string, fallback: string) {
  const normalized = slugify(value);

  return normalized || slugify(fallback);
}

function sortByOrderIndex<T extends { orderIndex: number }>(items: T[]) {
  return [...items].sort((left, right) => left.orderIndex - right.orderIndex);
}

function sortSnapshot(snapshot: StoryAuthoringSnapshot): StoryAuthoringSnapshot {
  return {
    characters: [...snapshot.characters]
      .map((character) => ({
        ...character,
        emotions: [...character.emotions].sort((left, right) =>
          left.label.localeCompare(right.label)
        )
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    backgroundImages: [...snapshot.backgroundImages].sort((left, right) =>
      left.label.localeCompare(right.label)
    ),
    backgroundMusicTracks: [...snapshot.backgroundMusicTracks].sort((left, right) =>
      left.label.localeCompare(right.label)
    ),
    chapters: sortByOrderIndex(snapshot.chapters).map((chapter) => ({
      ...chapter,
      scenes: sortByOrderIndex(chapter.scenes).map((scene) => ({
        ...scene,
        characterIds: [...new Set(scene.characterIds)],
        dialogue: sortByOrderIndex(scene.dialogue)
      }))
    }))
  };
}

function isStorageMissingError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const statusCode = record.statusCode;
  const message = record.message;

  return (
    statusCode === "404" ||
    statusCode === 404 ||
    (typeof message === "string" && /not found/i.test(message))
  );
}

async function readJsonFile<T>(objectPath: string, fallback: T): Promise<T> {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(runtimeBucket).download(objectPath);

  if (error) {
    if (isStorageMissingError(error)) {
      return fallback;
    }

    throw new StoryRepositoryError(error.message);
  }

  try {
    return (JSON.parse(await data.text()) as T) ?? fallback;
  } catch {
    throw new StoryRepositoryError(`Invalid JSON stored at ${objectPath}.`);
  }
}

async function writeJsonFile(objectPath: string, value: unknown) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.storage
    .from(runtimeBucket)
    .upload(
      objectPath,
      Buffer.from(JSON.stringify(value, null, 2), "utf8"),
      {
        contentType: "application/json; charset=utf-8",
        upsert: true,
        cacheControl: "60"
      }
    );

  if (error) {
    throw new StoryRepositoryError(error.message);
  }
}

async function uploadFileToStorage(input: {
  file: File;
  objectPath: string;
  cacheControl: string;
}) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.storage
    .from(runtimeBucket)
    .upload(input.objectPath, Buffer.from(await input.file.arrayBuffer()), {
      contentType: input.file.type || "application/octet-stream",
      upsert: true,
      cacheControl: input.cacheControl
    });

  if (error) {
    throw new StoryRepositoryError(error.message);
  }

  return withBucketPath(input.objectPath);
}

async function removeStorageObjects(storagePaths: string[]) {
  if (storagePaths.length === 0) {
    return;
  }

  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const objectPaths = storagePaths
    .filter(Boolean)
    .map((path) => path.replace(`${runtimeBucket}/`, ""));
  const uniqueObjectPaths = [...new Set(objectPaths)];

  if (uniqueObjectPaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(runtimeBucket).remove(uniqueObjectPaths);

  if (error) {
    throw new StoryRepositoryError(error.message);
  }
}

async function listRuntimeChapterBundlePaths() {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(runtimeBucket)
    .list(`${RUNTIME_PREFIX}/chapters`, {
      limit: 500,
      offset: 0
    });

  if (error) {
    throw new StoryRepositoryError(error.message);
  }

  return (data ?? [])
    .filter((item) => item.name.endsWith(".json"))
    .map((item) => `${runtimeBucket}/${RUNTIME_PREFIX}/chapters/${item.name}`);
}

function assertRequiredFile(
  file: File | null | undefined,
  label: string
): asserts file is File {
  if (!file || file.size === 0) {
    throw new StoryRepositoryError(`${label} is required.`);
  }
}

function assertImageFile(file: File, label: string) {
  if (!file.type.startsWith("image/")) {
    throw new StoryRepositoryError(`${label} must be an image file.`);
  }
}

function assertAudioFile(file: File, label: string) {
  if (!file.type.startsWith("audio/")) {
    throw new StoryRepositoryError(`${label} must be an audio file.`);
  }
}

function loadDefaultCharactersFile(): CharactersCatalogFile {
  return {
    schemaVersion: STORY_SCHEMA_VERSION,
    updatedAt: nowIsoString(),
    characters: []
  };
}

function loadDefaultAssetsFile(): AssetsCatalogFile {
  return {
    schemaVersion: STORY_SCHEMA_VERSION,
    updatedAt: nowIsoString(),
    backgroundImages: [],
    backgroundMusicTracks: []
  };
}

function loadDefaultChaptersFile(): ChaptersCatalogFile {
  return {
    schemaVersion: STORY_SCHEMA_VERSION,
    updatedAt: nowIsoString(),
    chapters: []
  };
}

async function loadAuthoringSnapshot(): Promise<StoryAuthoringSnapshot> {
  const [charactersFile, assetsFile, chaptersFile] = await Promise.all([
    readJsonFile(AUTHORING_CHARACTERS_PATH, loadDefaultCharactersFile()),
    readJsonFile(AUTHORING_ASSETS_PATH, loadDefaultAssetsFile()),
    readJsonFile(AUTHORING_CHAPTERS_PATH, loadDefaultChaptersFile())
  ]);

  return sortSnapshot({
    characters: charactersFile.characters ?? [],
    backgroundImages: assetsFile.backgroundImages ?? [],
    backgroundMusicTracks: assetsFile.backgroundMusicTracks ?? [],
    chapters: chaptersFile.chapters ?? []
  });
}

async function persistAuthoringSnapshot(snapshot: StoryAuthoringSnapshot) {
  const normalizedSnapshot = sortSnapshot(snapshot);
  const updatedAt = nowIsoString();

  await Promise.all([
    writeJsonFile(AUTHORING_CHARACTERS_PATH, {
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt,
      characters: normalizedSnapshot.characters
    } satisfies CharactersCatalogFile),
    writeJsonFile(AUTHORING_ASSETS_PATH, {
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt,
      backgroundImages: normalizedSnapshot.backgroundImages,
      backgroundMusicTracks: normalizedSnapshot.backgroundMusicTracks
    } satisfies AssetsCatalogFile),
    writeJsonFile(AUTHORING_CHAPTERS_PATH, {
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt,
      chapters: normalizedSnapshot.chapters
    } satisfies ChaptersCatalogFile)
  ]);

  return normalizedSnapshot;
}

async function persistRuntimeArtifacts(snapshot: StoryAuthoringSnapshot) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const artifacts = compileRuntimeStory({
    snapshot,
    bucket: runtimeBucket,
    runtimePrefix: RUNTIME_PREFIX
  });

  await Promise.all([
    writeJsonFile(`${RUNTIME_PREFIX}/manifest.json`, artifacts.manifest),
    writeJsonFile(`${RUNTIME_PREFIX}/characters.json`, artifacts.charactersManifest),
    writeJsonFile(`${RUNTIME_PREFIX}/assets.json`, artifacts.assetsManifest),
    ...artifacts.chapterBundles.map((chapterBundle) =>
      writeJsonFile(
        `${RUNTIME_PREFIX}/chapters/${chapterBundle.chapterId}.json`,
        chapterBundle.bundle
      )
    )
  ]);

  const existingChapterPaths = await listRuntimeChapterBundlePaths();
  const activeChapterPaths = new Set(
    artifacts.chapterBundles.map((chapterBundle) => chapterBundle.path)
  );
  const staleChapterPaths = existingChapterPaths.filter(
    (path) => !activeChapterPaths.has(path)
  );

  await removeStorageObjects(staleChapterPaths);
}

async function commitSnapshot(snapshot: StoryAuthoringSnapshot) {
  const normalizedSnapshot = await persistAuthoringSnapshot(snapshot);

  await persistRuntimeArtifacts(normalizedSnapshot);

  return normalizedSnapshot;
}

function findCharacterOrThrow(snapshot: StoryAuthoringSnapshot, characterId: string) {
  const character = snapshot.characters.find((item) => item.id === characterId);

  if (!character) {
    throw new StoryRepositoryError("Character not found.");
  }

  return character;
}

function findBackgroundImageOrThrow(
  snapshot: StoryAuthoringSnapshot,
  assetId: string
) {
  const asset = snapshot.backgroundImages.find((item) => item.id === assetId);

  if (!asset) {
    throw new StoryRepositoryError("Background image asset not found.");
  }

  return asset;
}

function findBackgroundMusicOrThrow(
  snapshot: StoryAuthoringSnapshot,
  assetId: string
) {
  const asset = snapshot.backgroundMusicTracks.find((item) => item.id === assetId);

  if (!asset) {
    throw new StoryRepositoryError("Background music asset not found.");
  }

  return asset;
}

function findChapterOrThrow(snapshot: StoryAuthoringSnapshot, chapterId: string) {
  const chapter = snapshot.chapters.find((item) => item.id === chapterId);

  if (!chapter) {
    throw new StoryRepositoryError("Chapter not found.");
  }

  return chapter;
}

function findSceneOrThrow(chapter: ChapterDefinition, sceneId: string) {
  const scene = chapter.scenes.find((item) => item.id === sceneId);

  if (!scene) {
    throw new StoryRepositoryError("Scene not found.");
  }

  return scene;
}

function findDialogueEntryOrThrow(scene: SceneDefinition, dialogueEntryId: string) {
  const entry = scene.dialogue.find((item) => item.id === dialogueEntryId);

  if (!entry) {
    throw new StoryRepositoryError("Dialogue entry not found.");
  }

  return entry;
}

function ensureUniqueCharacterSlug(
  snapshot: StoryAuthoringSnapshot,
  slug: string,
  excludeCharacterId?: string
) {
  const isTaken = snapshot.characters.some(
    (character) =>
      character.slug === slug && character.id !== excludeCharacterId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Character slug must be unique.");
  }
}

function ensureUniqueAssetSlug(input: {
  assets: Array<{ id: string; slug: string }>;
  slug: string;
  excludeAssetId?: string;
  label: string;
}) {
  const isTaken = input.assets.some(
    (asset) => asset.slug === input.slug && asset.id !== input.excludeAssetId
  );

  if (isTaken) {
    throw new StoryRepositoryError(`${input.label} slug must be unique.`);
  }
}

function ensureUniqueChapterSlug(
  snapshot: StoryAuthoringSnapshot,
  slug: string,
  excludeChapterId?: string
) {
  const isTaken = snapshot.chapters.some(
    (chapter) => chapter.slug === slug && chapter.id !== excludeChapterId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Chapter slug must be unique.");
  }
}

function ensureUniqueChapterOrder(
  snapshot: StoryAuthoringSnapshot,
  orderIndex: number,
  excludeChapterId?: string
) {
  const isTaken = snapshot.chapters.some(
    (chapter) => chapter.orderIndex === orderIndex && chapter.id !== excludeChapterId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Chapter order must be unique.");
  }
}

function ensureUniqueSceneOrder(
  chapter: ChapterDefinition,
  orderIndex: number,
  excludeSceneId?: string
) {
  const isTaken = chapter.scenes.some(
    (scene) => scene.orderIndex === orderIndex && scene.id !== excludeSceneId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Scene order must be unique within the chapter.");
  }
}

function ensureUniqueDialogueOrder(
  scene: SceneDefinition,
  orderIndex: number,
  excludeDialogueId?: string
) {
  const isTaken = scene.dialogue.some(
    (entry) => entry.orderIndex === orderIndex && entry.id !== excludeDialogueId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Dialogue order must be unique within the scene.");
  }
}

function ensureUniqueEmotionKey(
  character: CharacterDefinition,
  emotionKey: string,
  excludeEmotionId?: string
) {
  const isTaken = character.emotions.some(
    (emotion) => emotion.key === emotionKey && emotion.id !== excludeEmotionId
  );

  if (isTaken) {
    throw new StoryRepositoryError("Emotion key must be unique for the character.");
  }
}

function ensureSceneCharactersExist(
  snapshot: StoryAuthoringSnapshot,
  characterIds: string[]
) {
  for (const characterId of characterIds) {
    findCharacterOrThrow(snapshot, characterId);
  }
}

function assertSpeakerSelection(input: {
  snapshot: StoryAuthoringSnapshot;
  scene: SceneDefinition;
  speakerType: "narrator" | "character";
  characterId: string | null;
  emotionKey: string | null;
}) {
  if (input.speakerType === "narrator") {
    return;
  }

  if (!input.characterId) {
    throw new StoryRepositoryError("Character dialogue requires a character.");
  }

  if (!input.scene.characterIds.includes(input.characterId)) {
    throw new StoryRepositoryError(
      "Dialogue speaker must be selected in the scene character pool."
    );
  }

  if (!input.emotionKey) {
    throw new StoryRepositoryError("Character dialogue requires an emotion.");
  }

  const character = findCharacterOrThrow(input.snapshot, input.characterId);
  const emotion = character.emotions.find((item) => item.key === input.emotionKey);

  if (!emotion) {
    throw new StoryRepositoryError("Selected emotion does not belong to the speaker.");
  }
}

function assertSceneDialogueStillValid(
  snapshot: StoryAuthoringSnapshot,
  scene: SceneDefinition,
  nextCharacterIds: string[]
) {
  for (const entry of scene.dialogue) {
    if (
      entry.speaker.type === "character" &&
      !nextCharacterIds.includes(entry.speaker.characterId)
    ) {
      throw new StoryRepositoryError(
        "Cannot remove a scene character while dialogue still references that character."
      );
    }

    const speaker = entry.speaker;

    if (speaker.type === "character") {
      const character = findCharacterOrThrow(snapshot, speaker.characterId);
      const emotionExists = character.emotions.some(
        (emotion) => emotion.key === speaker.emotionKey
      );

      if (!emotionExists) {
        throw new StoryRepositoryError(
          "Scene dialogue references an emotion that no longer exists."
        );
      }
    }
  }
}

function updateEmotionReferences(
  snapshot: StoryAuthoringSnapshot,
  input: {
    characterId: string;
    previousEmotionKey: string;
    nextEmotionKey: string;
  }
) {
  snapshot.chapters.forEach((chapter) => {
    chapter.scenes.forEach((scene) => {
      scene.dialogue.forEach((entry) => {
        const speaker = entry.speaker;

        if (
          speaker.type === "character" &&
          speaker.characterId === input.characterId &&
          speaker.emotionKey === input.previousEmotionKey
        ) {
          speaker.emotionKey = input.nextEmotionKey;
        }
      });
    });
  });
}

function isEmotionReferenced(
  snapshot: StoryAuthoringSnapshot,
  input: {
    characterId: string;
    emotionKey: string;
  }
) {
  return snapshot.chapters.some((chapter) =>
    chapter.scenes.some((scene) =>
      scene.dialogue.some(
        (entry) =>
          entry.speaker.type === "character" &&
          entry.speaker.characterId === input.characterId &&
          entry.speaker.emotionKey === input.emotionKey
      )
    )
  );
}

function isCharacterReferenced(snapshot: StoryAuthoringSnapshot, characterId: string) {
  return snapshot.chapters.some((chapter) =>
    chapter.scenes.some(
      (scene) =>
        scene.characterIds.includes(characterId) ||
        scene.dialogue.some(
          (entry) =>
            entry.speaker.type === "character" &&
            entry.speaker.characterId === characterId
        )
    )
  );
}

function isBackgroundImageReferenced(
  snapshot: StoryAuthoringSnapshot,
  backgroundImageAssetId: string
) {
  return snapshot.chapters.some((chapter) =>
    chapter.scenes.some(
      (scene) => scene.backgroundImageAssetId === backgroundImageAssetId
    )
  );
}

function isBackgroundMusicReferenced(
  snapshot: StoryAuthoringSnapshot,
  backgroundMusicAssetId: string
) {
  return snapshot.chapters.some((chapter) =>
    chapter.scenes.some(
      (scene) => scene.backgroundMusicAssetId === backgroundMusicAssetId
    )
  );
}

export async function getAdminStoryData() {
  return loadAuthoringSnapshot();
}

export async function createCharacter(input: {
  name: string;
  slug: string;
  bio: string | null;
  initialEmotionKey: string | null;
  initialEmotionLabel: string | null;
  imageFile: File;
}) {
  assertRequiredFile(input.imageFile, "Character image");
  assertImageFile(input.imageFile, "Character image");

  const snapshot = await loadAuthoringSnapshot();
  const characterId = createEntityId("character");
  const emotionId = createEntityId("emotion");
  const normalizedSlug = normalizeSlugInput(input.slug, input.name);
  const emotionKey = normalizeSlugInput(
    input.initialEmotionKey ?? input.initialEmotionLabel ?? "default",
    "default"
  );
  const emotionLabel = input.initialEmotionLabel?.trim() || "Default";

  ensureUniqueCharacterSlug(snapshot, normalizedSlug);

  const imagePath = await uploadFileToStorage({
    file: input.imageFile,
    objectPath: `media/characters/${characterId}/${emotionId}`,
    cacheControl: "31536000"
  });

  const timestamp = nowIsoString();
  const character: CharacterDefinition = {
    id: characterId,
    name: input.name.trim(),
    slug: normalizedSlug,
    bio: input.bio,
    defaultEmotionKey: emotionKey,
    emotions: [
      {
        id: emotionId,
        key: emotionKey,
        label: emotionLabel,
        imagePath,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  snapshot.characters.push(character);
  await commitSnapshot(snapshot);

  return character;
}

export async function updateCharacter(input: {
  characterId: string;
  name: string;
  slug: string;
  bio: string | null;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const normalizedSlug = normalizeSlugInput(input.slug, input.name);

  ensureUniqueCharacterSlug(snapshot, normalizedSlug, character.id);

  character.name = input.name.trim();
  character.slug = normalizedSlug;
  character.bio = input.bio;
  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return character;
}

export async function deleteCharacter(characterId: string) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, characterId);

  if (isCharacterReferenced(snapshot, characterId)) {
    throw new StoryRepositoryError(
      "Cannot delete a character while chapters or dialogue still reference it."
    );
  }

  snapshot.characters = snapshot.characters.filter((item) => item.id !== characterId);
  await commitSnapshot(snapshot);
  await removeStorageObjects(character.emotions.map((emotion) => emotion.imagePath));
}

export async function addCharacterEmotion(input: {
  characterId: string;
  emotionKey: string;
  emotionLabel: string;
  imageFile: File;
}) {
  assertRequiredFile(input.imageFile, "Emotion image");
  assertImageFile(input.imageFile, "Emotion image");

  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const emotionId = createEntityId("emotion");
  const normalizedEmotionKey = normalizeSlugInput(
    input.emotionKey,
    input.emotionLabel
  );

  ensureUniqueEmotionKey(character, normalizedEmotionKey);

  const imagePath = await uploadFileToStorage({
    file: input.imageFile,
    objectPath: `media/characters/${character.id}/${emotionId}`,
    cacheControl: "31536000"
  });

  character.emotions.push({
    id: emotionId,
    key: normalizedEmotionKey,
    label: input.emotionLabel.trim(),
    imagePath,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  });
  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return character;
}

export async function updateCharacterEmotion(input: {
  characterId: string;
  emotionId: string;
  emotionKey: string;
  emotionLabel: string;
  imageFile: File | null;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const emotion = character.emotions.find((item) => item.id === input.emotionId);

  if (!emotion) {
    throw new StoryRepositoryError("Emotion not found.");
  }

  const previousEmotionKey = emotion.key;
  const nextEmotionKey = normalizeSlugInput(input.emotionKey, input.emotionLabel);

  ensureUniqueEmotionKey(character, nextEmotionKey, emotion.id);

  emotion.key = nextEmotionKey;
  emotion.label = input.emotionLabel.trim();
  emotion.updatedAt = nowIsoString();

  if (input.imageFile && input.imageFile.size > 0) {
    assertImageFile(input.imageFile, "Emotion image");
    emotion.imagePath = await uploadFileToStorage({
      file: input.imageFile,
      objectPath: `media/characters/${character.id}/${emotion.id}`,
      cacheControl: "31536000"
    });
  }

  if (character.defaultEmotionKey === previousEmotionKey) {
    character.defaultEmotionKey = nextEmotionKey;
  }

  if (previousEmotionKey !== nextEmotionKey) {
    updateEmotionReferences(snapshot, {
      characterId: character.id,
      previousEmotionKey,
      nextEmotionKey
    });
  }

  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return character;
}

export async function setDefaultCharacterEmotion(input: {
  characterId: string;
  emotionId: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const emotion = character.emotions.find((item) => item.id === input.emotionId);

  if (!emotion) {
    throw new StoryRepositoryError("Emotion not found.");
  }

  character.defaultEmotionKey = emotion.key;
  character.updatedAt = nowIsoString();
  await commitSnapshot(snapshot);

  return character;
}

export async function deleteCharacterEmotion(input: {
  characterId: string;
  emotionId: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const emotion = character.emotions.find((item) => item.id === input.emotionId);

  if (!emotion) {
    throw new StoryRepositoryError("Emotion not found.");
  }

  if (character.emotions.length === 1) {
    throw new StoryRepositoryError("A character must always have at least one emotion.");
  }

  if (
    isEmotionReferenced(snapshot, {
      characterId: character.id,
      emotionKey: emotion.key
    })
  ) {
    throw new StoryRepositoryError(
      "Cannot delete an emotion while scene dialogue still references it."
    );
  }

  character.emotions = character.emotions.filter((item) => item.id !== input.emotionId);

  if (character.defaultEmotionKey === emotion.key) {
    character.defaultEmotionKey = character.emotions[0].key;
  }

  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);
  await removeStorageObjects([emotion.imagePath]);
}

export async function createBackgroundImageAsset(input: {
  label: string;
  slug: string;
  altText: string | null;
  file: File;
}) {
  assertRequiredFile(input.file, "Background image");
  assertImageFile(input.file, "Background image");

  const snapshot = await loadAuthoringSnapshot();
  const assetId = createEntityId("bg");
  const normalizedSlug = normalizeSlugInput(input.slug, input.label);

  ensureUniqueAssetSlug({
    assets: snapshot.backgroundImages,
    slug: normalizedSlug,
    label: "Background image"
  });

  const filePath = await uploadFileToStorage({
    file: input.file,
    objectPath: `media/background-images/${assetId}`,
    cacheControl: "31536000"
  });

  const asset: BackgroundImageAsset = {
    id: assetId,
    type: "background_image",
    label: input.label.trim(),
    slug: normalizedSlug,
    altText: input.altText,
    filePath,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  };

  snapshot.backgroundImages.push(asset);
  await commitSnapshot(snapshot);

  return asset;
}

export async function updateBackgroundImageAsset(input: {
  assetId: string;
  label: string;
  slug: string;
  altText: string | null;
  file: File | null;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const asset = findBackgroundImageOrThrow(snapshot, input.assetId);
  const normalizedSlug = normalizeSlugInput(input.slug, input.label);

  ensureUniqueAssetSlug({
    assets: snapshot.backgroundImages,
    slug: normalizedSlug,
    excludeAssetId: asset.id,
    label: "Background image"
  });

  asset.label = input.label.trim();
  asset.slug = normalizedSlug;
  asset.altText = input.altText;
  asset.updatedAt = nowIsoString();

  if (input.file && input.file.size > 0) {
    assertImageFile(input.file, "Background image");
    asset.filePath = await uploadFileToStorage({
      file: input.file,
      objectPath: `media/background-images/${asset.id}`,
      cacheControl: "31536000"
    });
  }

  await commitSnapshot(snapshot);

  return asset;
}

export async function deleteBackgroundImageAsset(assetId: string) {
  const snapshot = await loadAuthoringSnapshot();
  const asset = findBackgroundImageOrThrow(snapshot, assetId);

  if (isBackgroundImageReferenced(snapshot, asset.id)) {
    throw new StoryRepositoryError(
      "Cannot delete a background image while scenes still reference it."
    );
  }

  snapshot.backgroundImages = snapshot.backgroundImages.filter(
    (item) => item.id !== assetId
  );
  await commitSnapshot(snapshot);
  await removeStorageObjects([asset.filePath]);
}

export async function createBackgroundMusicTrack(input: {
  label: string;
  slug: string;
  file: File;
}) {
  assertRequiredFile(input.file, "Background music");
  assertAudioFile(input.file, "Background music");

  const snapshot = await loadAuthoringSnapshot();
  const trackId = createEntityId("music");
  const normalizedSlug = normalizeSlugInput(input.slug, input.label);

  ensureUniqueAssetSlug({
    assets: snapshot.backgroundMusicTracks,
    slug: normalizedSlug,
    label: "Background music"
  });

  const filePath = await uploadFileToStorage({
    file: input.file,
    objectPath: `media/background-music/${trackId}`,
    cacheControl: "31536000"
  });

  const track: BackgroundMusicTrack = {
    id: trackId,
    type: "background_music",
    label: input.label.trim(),
    slug: normalizedSlug,
    filePath,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  };

  snapshot.backgroundMusicTracks.push(track);
  await commitSnapshot(snapshot);

  return track;
}

export async function updateBackgroundMusicTrack(input: {
  assetId: string;
  label: string;
  slug: string;
  file: File | null;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const track = findBackgroundMusicOrThrow(snapshot, input.assetId);
  const normalizedSlug = normalizeSlugInput(input.slug, input.label);

  ensureUniqueAssetSlug({
    assets: snapshot.backgroundMusicTracks,
    slug: normalizedSlug,
    excludeAssetId: track.id,
    label: "Background music"
  });

  track.label = input.label.trim();
  track.slug = normalizedSlug;
  track.updatedAt = nowIsoString();

  if (input.file && input.file.size > 0) {
    assertAudioFile(input.file, "Background music");
    track.filePath = await uploadFileToStorage({
      file: input.file,
      objectPath: `media/background-music/${track.id}`,
      cacheControl: "31536000"
    });
  }

  await commitSnapshot(snapshot);

  return track;
}

export async function deleteBackgroundMusicTrack(assetId: string) {
  const snapshot = await loadAuthoringSnapshot();
  const track = findBackgroundMusicOrThrow(snapshot, assetId);

  if (isBackgroundMusicReferenced(snapshot, track.id)) {
    throw new StoryRepositoryError(
      "Cannot delete a music track while scenes still reference it."
    );
  }

  snapshot.backgroundMusicTracks = snapshot.backgroundMusicTracks.filter(
    (item) => item.id !== assetId
  );
  await commitSnapshot(snapshot);
  await removeStorageObjects([track.filePath]);
}

export async function createChapter(input: {
  title: string;
  slug: string;
  orderIndex: number;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapterId = createEntityId("chapter");
  const normalizedSlug = normalizeSlugInput(input.slug, input.title);

  ensureUniqueChapterSlug(snapshot, normalizedSlug);
  ensureUniqueChapterOrder(snapshot, input.orderIndex);

  const chapter: ChapterDefinition = {
    id: chapterId,
    title: input.title.trim(),
    slug: normalizedSlug,
    orderIndex: input.orderIndex,
    scenes: [],
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  };

  snapshot.chapters.push(chapter);
  await commitSnapshot(snapshot);

  return chapter;
}

export async function updateChapter(input: {
  chapterId: string;
  title: string;
  slug: string;
  orderIndex: number;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const normalizedSlug = normalizeSlugInput(input.slug, input.title);

  ensureUniqueChapterSlug(snapshot, normalizedSlug, chapter.id);
  ensureUniqueChapterOrder(snapshot, input.orderIndex, chapter.id);

  chapter.title = input.title.trim();
  chapter.slug = normalizedSlug;
  chapter.orderIndex = input.orderIndex;
  chapter.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return chapter;
}

export async function deleteChapter(chapterId: string) {
  const snapshot = await loadAuthoringSnapshot();
  findChapterOrThrow(snapshot, chapterId);
  snapshot.chapters = snapshot.chapters.filter((chapter) => chapter.id !== chapterId);
  await commitSnapshot(snapshot);
}

export async function createScene(input: {
  chapterId: string;
  title: string;
  orderIndex: number;
  backgroundImageAssetId: string;
  backgroundMusicAssetId: string | null;
  characterIds: string[];
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const sceneId = createEntityId("scene");
  const characterIds = [...new Set(input.characterIds)];

  ensureUniqueSceneOrder(chapter, input.orderIndex);
  findBackgroundImageOrThrow(snapshot, input.backgroundImageAssetId);

  if (input.backgroundMusicAssetId) {
    findBackgroundMusicOrThrow(snapshot, input.backgroundMusicAssetId);
  }

  ensureSceneCharactersExist(snapshot, characterIds);

  const scene: SceneDefinition = {
    id: sceneId,
    title: input.title.trim(),
    orderIndex: input.orderIndex,
    backgroundImageAssetId: input.backgroundImageAssetId,
    backgroundMusicAssetId: input.backgroundMusicAssetId,
    characterIds,
    dialogue: [],
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  };

  chapter.scenes.push(scene);
  chapter.updatedAt = nowIsoString();
  await commitSnapshot(snapshot);

  return scene;
}

export async function updateScene(input: {
  chapterId: string;
  sceneId: string;
  title: string;
  orderIndex: number;
  backgroundImageAssetId: string;
  backgroundMusicAssetId: string | null;
  characterIds: string[];
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const nextCharacterIds = [...new Set(input.characterIds)];

  ensureUniqueSceneOrder(chapter, input.orderIndex, scene.id);
  findBackgroundImageOrThrow(snapshot, input.backgroundImageAssetId);

  if (input.backgroundMusicAssetId) {
    findBackgroundMusicOrThrow(snapshot, input.backgroundMusicAssetId);
  }

  ensureSceneCharactersExist(snapshot, nextCharacterIds);
  assertSceneDialogueStillValid(snapshot, scene, nextCharacterIds);

  scene.title = input.title.trim();
  scene.orderIndex = input.orderIndex;
  scene.backgroundImageAssetId = input.backgroundImageAssetId;
  scene.backgroundMusicAssetId = input.backgroundMusicAssetId;
  scene.characterIds = nextCharacterIds;
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return scene;
}

export async function deleteScene(input: { chapterId: string; sceneId: string }) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  findSceneOrThrow(chapter, input.sceneId);
  chapter.scenes = chapter.scenes.filter((scene) => scene.id !== input.sceneId);
  chapter.updatedAt = nowIsoString();
  await commitSnapshot(snapshot);
}

export async function createDialogueEntry(input: {
  chapterId: string;
  sceneId: string;
  orderIndex: number;
  speakerType: "narrator" | "character";
  characterId: string | null;
  emotionKey: string | null;
  text: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);

  ensureUniqueDialogueOrder(scene, input.orderIndex);
  assertSpeakerSelection({
    snapshot,
    scene,
    speakerType: input.speakerType,
    characterId: input.characterId,
    emotionKey: input.emotionKey
  });

  const entry: DialogueEntry = {
    id: createEntityId("dialogue"),
    orderIndex: input.orderIndex,
    text: input.text.trim(),
    speaker:
      input.speakerType === "narrator"
        ? {
            type: "narrator"
          }
        : {
            type: "character",
            characterId: input.characterId as string,
            emotionKey: input.emotionKey as string
          },
    createdAt: nowIsoString(),
    updatedAt: nowIsoString()
  };

  scene.dialogue.push(entry);
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();
  await commitSnapshot(snapshot);

  return entry;
}

export async function updateDialogueEntry(input: {
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  orderIndex: number;
  speakerType: "narrator" | "character";
  characterId: string | null;
  emotionKey: string | null;
  text: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const entry = findDialogueEntryOrThrow(scene, input.dialogueEntryId);

  ensureUniqueDialogueOrder(scene, input.orderIndex, entry.id);
  assertSpeakerSelection({
    snapshot,
    scene,
    speakerType: input.speakerType,
    characterId: input.characterId,
    emotionKey: input.emotionKey
  });

  entry.orderIndex = input.orderIndex;
  entry.text = input.text.trim();
  entry.speaker =
    input.speakerType === "narrator"
      ? {
          type: "narrator"
        }
      : {
          type: "character",
          characterId: input.characterId as string,
          emotionKey: input.emotionKey as string
        };
  entry.updatedAt = nowIsoString();
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  return entry;
}

export async function deleteDialogueEntry(input: {
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  findDialogueEntryOrThrow(scene, input.dialogueEntryId);
  scene.dialogue = scene.dialogue.filter((entry) => entry.id !== input.dialogueEntryId);
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();
  await commitSnapshot(snapshot);
}
