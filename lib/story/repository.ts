import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  compileRuntimeChapterBundle,
  compileRuntimeStory
} from "@/lib/story/published";
import {
  createSceneDraftPayload,
  isSceneDraftTempId,
  parseSceneDraftPayload
} from "@/lib/story/scene-draft";
import { slugify } from "@/lib/story/slug";
import { isPrimaryLeftStageCharacterSlug } from "@/lib/story/staging";
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
  SceneDraftPayload,
  StoryAuthoringSnapshot
} from "@/lib/story/types";
import { STORY_SCHEMA_VERSION } from "@/lib/story/types";
import { BASE_DRESS_OPTION_KEY } from "@/lib/story/wardrobe";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

export class StoryRepositoryError extends Error {}

const AUTHORING_CHARACTERS_PATH = "authoring/characters.json";
const AUTHORING_ASSETS_PATH = "authoring/assets.json";
const AUTHORING_CHAPTERS_PATH = "authoring/chapters.json";
const RUNTIME_PREFIX = "runtime";
const STORAGE_FETCH_FAILURE_MESSAGE =
  "Unable to reach Supabase storage while loading authoring data. Check your Supabase URL, network connection, and Supabase project availability.";

export type StoredSceneDraft = {
  sceneId: string;
  chapterId: string;
  sourceSceneUpdatedAt: string;
  payload: SceneDraftPayload;
  createdAt: string;
  updatedAt: string;
};

type SceneDraftRecord = {
  sceneId: string;
  chapterId: string;
  sourceSceneUpdatedAt: Date;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type SceneDraftDelegate = {
  findUnique(args: {
    where: {
      sceneId: string;
    };
  }): Promise<SceneDraftRecord | null>;
  upsert(args: {
    where: {
      sceneId: string;
    };
    update: {
      chapterId: string;
      sourceSceneUpdatedAt: Date;
      payload: Prisma.InputJsonValue;
    };
    create: {
      sceneId: string;
      chapterId: string;
      sourceSceneUpdatedAt: Date;
      payload: Prisma.InputJsonValue;
    };
  }): Promise<SceneDraftRecord>;
  deleteMany(args: {
    where: {
      sceneId: string;
    };
  }): Promise<{
    count: number;
  }>;
};

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

function getNextOrderIndex(items: Array<{ orderIndex: number }>) {
  return (
    items.reduce((highest, item) => Math.max(highest, item.orderIndex), 0) + 1
  );
}

function moveItemWithinOrderedScope<
  T extends { id: string; orderIndex: number }
>(items: T[], itemId: string, requestedOrderIndex: number) {
  if (!Number.isInteger(requestedOrderIndex) || requestedOrderIndex < 1) {
    throw new StoryRepositoryError("Order must be a positive integer.");
  }

  const orderedItems = sortByOrderIndex(items);
  const currentIndex = orderedItems.findIndex((item) => item.id === itemId);

  if (currentIndex < 0) {
    throw new StoryRepositoryError("Ordered item not found.");
  }

  const [movedItem] = orderedItems.splice(currentIndex, 1);
  const targetIndex =
    Math.min(requestedOrderIndex, orderedItems.length + 1) - 1;

  orderedItems.splice(targetIndex, 0, movedItem);
  orderedItems.forEach((item, index) => {
    item.orderIndex = index + 1;
  });

  return orderedItems;
}

function normalizeDialogueEntry(entry: DialogueEntry): DialogueEntry {
  if (entry.speaker.type !== "dress_prompt") {
    return entry;
  }

  return {
    ...entry,
    speaker: {
      ...entry.speaker,
      dressOptionKeys: [...new Set(entry.speaker.dressOptionKeys)]
    }
  };
}

function sortSnapshot(
  snapshot: StoryAuthoringSnapshot
): StoryAuthoringSnapshot {
  return {
    characters: [...snapshot.characters]
      .map((character) => ({
        ...character,
        emotions: [...character.emotions].sort((left, right) =>
          left.label.localeCompare(right.label)
        ),
        dresses: [...(character.dresses ?? [])]
          .map((dress) => ({
            ...dress,
            emotionOverrides: [...(dress.emotionOverrides ?? [])].sort(
              (left, right) => left.emotionKey.localeCompare(right.emotionKey)
            )
          }))
          .sort((left, right) => left.label.localeCompare(right.label))
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    backgroundImages: [...snapshot.backgroundImages].sort((left, right) =>
      left.label.localeCompare(right.label)
    ),
    backgroundMusicTracks: [...snapshot.backgroundMusicTracks].sort(
      (left, right) => left.label.localeCompare(right.label)
    ),
    chapters: sortByOrderIndex(snapshot.chapters).map((chapter) => ({
      ...chapter,
      scenes: sortByOrderIndex(chapter.scenes).map((scene) => ({
        ...scene,
        characterIds: [...new Set(scene.characterIds)],
        dialogue: sortByOrderIndex(scene.dialogue).map(normalizeDialogueEntry)
      }))
    }))
  };
}

function toStoredSceneDraft(value: {
  sceneId: string;
  chapterId: string;
  sourceSceneUpdatedAt: Date;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): StoredSceneDraft | null {
  const payload = parseSceneDraftPayload(value.payload);

  if (!payload) {
    return null;
  }

  return {
    sceneId: value.sceneId,
    chapterId: value.chapterId,
    sourceSceneUpdatedAt: value.sourceSceneUpdatedAt.toISOString(),
    payload,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString()
  };
}

function getSceneDraftDelegate() {
  const delegate = (prisma as unknown as { adminSceneDraft?: SceneDraftDelegate })
    .adminSceneDraft;

  if (
    !delegate ||
    typeof delegate.findUnique !== "function" ||
    typeof delegate.upsert !== "function" ||
    typeof delegate.deleteMany !== "function"
  ) {
    return null;
  }

  return delegate;
}

function isMissingSceneDraftTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message : String(error);

  return (
    /AdminSceneDraft/i.test(message) &&
    /(does not exist|no such table|unknown table|relation)/i.test(message)
  );
}

function getSceneDraftStorageUnavailableMessage() {
  return "Scene draft storage is unavailable until the latest database migration is applied.";
}

async function findSceneDraftRecord(sceneId: string) {
  const delegate = getSceneDraftDelegate();

  if (delegate) {
    return delegate.findUnique({
      where: {
        sceneId
      }
    });
  }

  try {
    const rows = await prisma.$queryRawUnsafe<SceneDraftRecord[]>(
      `SELECT "sceneId", "chapterId", "sourceSceneUpdatedAt", "payload", "createdAt", "updatedAt"
       FROM "public"."AdminSceneDraft"
       WHERE "sceneId" = $1
       LIMIT 1`,
      sceneId
    );

    return rows[0] ?? null;
  } catch (error) {
    if (isMissingSceneDraftTableError(error)) {
      return null;
    }

    throw error;
  }
}

async function upsertSceneDraftRecord(input: {
  sceneId: string;
  chapterId: string;
  sourceSceneUpdatedAt: string;
  payload: SceneDraftPayload;
}) {
  const sourceSceneUpdatedAt = new Date(input.sourceSceneUpdatedAt);
  const payload = input.payload as Prisma.InputJsonValue;
  const delegate = getSceneDraftDelegate();

  if (delegate) {
    return delegate.upsert({
      where: {
        sceneId: input.sceneId
      },
      update: {
        chapterId: input.chapterId,
        sourceSceneUpdatedAt,
        payload
      },
      create: {
        sceneId: input.sceneId,
        chapterId: input.chapterId,
        sourceSceneUpdatedAt,
        payload
      }
    });
  }

  try {
    const rows = await prisma.$queryRawUnsafe<SceneDraftRecord[]>(
      `INSERT INTO "public"."AdminSceneDraft" (
         "sceneId",
         "chapterId",
         "sourceSceneUpdatedAt",
         "payload",
         "createdAt",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("sceneId") DO UPDATE
       SET
         "chapterId" = EXCLUDED."chapterId",
         "sourceSceneUpdatedAt" = EXCLUDED."sourceSceneUpdatedAt",
         "payload" = EXCLUDED."payload",
         "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "sceneId", "chapterId", "sourceSceneUpdatedAt", "payload", "createdAt", "updatedAt"`,
      input.sceneId,
      input.chapterId,
      sourceSceneUpdatedAt,
      JSON.stringify(input.payload)
    );

    const record = rows[0] ?? null;

    if (!record) {
      throw new StoryRepositoryError("Unable to persist scene draft.");
    }

    return record;
  } catch (error) {
    if (isMissingSceneDraftTableError(error)) {
      throw new StoryRepositoryError(getSceneDraftStorageUnavailableMessage());
    }

    throw error;
  }
}

async function deleteSceneDraftRecords(
  sceneId: string,
  options?: {
    ignoreMissingTable?: boolean;
  }
) {
  const delegate = getSceneDraftDelegate();

  if (delegate) {
    return delegate.deleteMany({
      where: {
        sceneId
      }
    });
  }

  try {
    const count = await prisma.$executeRawUnsafe(
      `DELETE FROM "public"."AdminSceneDraft" WHERE "sceneId" = $1`,
      sceneId
    );

    return {
      count: Number(count)
    };
  } catch (error) {
    if (isMissingSceneDraftTableError(error)) {
      if (options?.ignoreMissingTable) {
        return {
          count: 0
        };
      }

      throw new StoryRepositoryError(getSceneDraftStorageUnavailableMessage());
    }

    throw error;
  }
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

function isStorageFetchFailureError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message : String(error);
  const code =
    typeof record.code === "string" ? record.code.toLowerCase() : "";

  return (
    /fetch failed|network request failed|getaddrinfo|econnreset|enotfound/i.test(
      message
    ) ||
    code === "fetch_error"
  );
}

async function downloadStorageJson(objectPath: string) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  let data: Blob | null = null;
  let error: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nextResult = await supabase.storage.from(runtimeBucket).download(objectPath);
    data = nextResult.data;
    error = nextResult.error;

    if (!nextResult.error || !isStorageFetchFailureError(nextResult.error)) {
      break;
    }
  }

  return {
    data,
    error
  };
}

async function readJsonFile<T>(objectPath: string, fallback: T): Promise<T> {
  const { data, error } = await downloadStorageJson(objectPath);

  if (error) {
    if (isStorageMissingError(error)) {
      return fallback;
    }

    if (isStorageFetchFailureError(error)) {
      throw new StoryRepositoryError(STORAGE_FETCH_FAILURE_MESSAGE);
    }

    throw new StoryRepositoryError(error.message);
  }

  if (!data) {
    throw new StoryRepositoryError(
      `Storage download for ${objectPath} returned no data.`
    );
  }

  try {
    return (JSON.parse(await data.text()) as T) ?? fallback;
  } catch {
    throw new StoryRepositoryError(`Invalid JSON stored at ${objectPath}.`);
  }
}

async function writeJsonFile(
  objectPath: string,
  value: unknown,
  options?: {
    cacheControl?: string;
  }
) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.storage
    .from(runtimeBucket)
    .upload(objectPath, Buffer.from(JSON.stringify(value, null, 2), "utf8"), {
      contentType: "application/json; charset=utf-8",
      upsert: true,
      cacheControl: options?.cacheControl ?? "60"
    });

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

  const { error } = await supabase.storage
    .from(runtimeBucket)
    .remove(uniqueObjectPaths);

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
    } satisfies CharactersCatalogFile, {
      cacheControl: "0"
    }),
    writeJsonFile(AUTHORING_ASSETS_PATH, {
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt,
      backgroundImages: normalizedSnapshot.backgroundImages,
      backgroundMusicTracks: normalizedSnapshot.backgroundMusicTracks
    } satisfies AssetsCatalogFile, {
      cacheControl: "0"
    }),
    writeJsonFile(AUTHORING_CHAPTERS_PATH, {
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt,
      chapters: normalizedSnapshot.chapters
    } satisfies ChaptersCatalogFile, {
      cacheControl: "0"
    })
  ]);

  return normalizedSnapshot;
}

async function persistChaptersSnapshot(snapshot: StoryAuthoringSnapshot) {
  const normalizedSnapshot = sortSnapshot(snapshot);
  const updatedAt = nowIsoString();

  await writeJsonFile(AUTHORING_CHAPTERS_PATH, {
    schemaVersion: STORY_SCHEMA_VERSION,
    updatedAt,
    chapters: normalizedSnapshot.chapters
  } satisfies ChaptersCatalogFile, {
    cacheControl: "0"
  });

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
    writeJsonFile(
      `${RUNTIME_PREFIX}/characters.json`,
      artifacts.charactersManifest
    ),
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

async function persistRuntimeChapterArtifact(
  snapshot: StoryAuthoringSnapshot,
  chapterId: string
) {
  const { runtimeBucket } = getSupabaseServerEnv();
  const chapterBundle = compileRuntimeChapterBundle({
    snapshot,
    chapterId,
    bucket: runtimeBucket,
    runtimePrefix: RUNTIME_PREFIX
  });

  await writeJsonFile(
    `${RUNTIME_PREFIX}/chapters/${chapterBundle.chapterId}.json`,
    chapterBundle.bundle
  );
}

async function commitSnapshot(snapshot: StoryAuthoringSnapshot) {
  const normalizedSnapshot = await persistAuthoringSnapshot(snapshot);

  await persistRuntimeArtifacts(normalizedSnapshot);

  return normalizedSnapshot;
}

async function commitChapterScopedSnapshot(
  snapshot: StoryAuthoringSnapshot,
  chapterId: string
) {
  const normalizedSnapshot = await persistChaptersSnapshot(snapshot);

  await persistRuntimeChapterArtifact(normalizedSnapshot, chapterId);

  return normalizedSnapshot;
}

function findCharacterOrThrow(
  snapshot: StoryAuthoringSnapshot,
  characterId: string
) {
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
  const asset = snapshot.backgroundMusicTracks.find(
    (item) => item.id === assetId
  );

  if (!asset) {
    throw new StoryRepositoryError("Background music asset not found.");
  }

  return asset;
}

function findChapterOrThrow(
  snapshot: StoryAuthoringSnapshot,
  chapterId: string
) {
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

function findDialogueEntryOrThrow(
  scene: SceneDefinition,
  dialogueEntryId: string
) {
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
    (chapter) =>
      chapter.orderIndex === orderIndex && chapter.id !== excludeChapterId
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
    throw new StoryRepositoryError(
      "Scene order must be unique within the chapter."
    );
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
    throw new StoryRepositoryError(
      "Dialogue order must be unique within the scene."
    );
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
    throw new StoryRepositoryError(
      "Emotion key must be unique for the character."
    );
  }
}

function ensureUniqueDressKey(
  character: CharacterDefinition,
  dressKey: string,
  excludeDressId?: string
) {
  const isTaken = character.dresses.some(
    (dress) => dress.key === dressKey && dress.id !== excludeDressId
  );

  if (isTaken) {
    throw new StoryRepositoryError(
      "Dress key must be unique for the character."
    );
  }
}

function findDressPromptCharacter(
  snapshot: StoryAuthoringSnapshot,
  scene: SceneDefinition
) {
  return (
    scene.characterIds
      .map((characterId) => findCharacterOrThrow(snapshot, characterId))
      .find((character) => isPrimaryLeftStageCharacterSlug(character.slug)) ??
    null
  );
}

function ensureSceneCharactersExist(
  snapshot: StoryAuthoringSnapshot,
  characterIds: string[]
) {
  for (const characterId of characterIds) {
    findCharacterOrThrow(snapshot, characterId);
  }
}

function assertDialogueSelection(input: {
  snapshot: StoryAuthoringSnapshot;
  scene: SceneDefinition;
  speakerType: "narrator" | "character" | "dress_prompt";
  characterId: string | null;
  emotionKey: string | null;
  dressOptionKeys?: string[];
}) {
  if (input.speakerType === "narrator") {
    return;
  }

  if (input.speakerType === "dress_prompt") {
    if (!input.characterId) {
      throw new StoryRepositoryError("Dress prompt requires a character.");
    }

    if (!input.scene.characterIds.includes(input.characterId)) {
      throw new StoryRepositoryError(
        "Dress prompt character must be selected in the scene character pool."
      );
    }

    const character = findCharacterOrThrow(input.snapshot, input.characterId);

    if (!isPrimaryLeftStageCharacterSlug(character.slug)) {
      throw new StoryRepositoryError(
        "Dress prompts currently support only Ocnoer."
      );
    }

    const sceneDressCharacter = findDressPromptCharacter(
      input.snapshot,
      input.scene
    );

    if (!sceneDressCharacter || sceneDressCharacter.id !== character.id) {
      throw new StoryRepositoryError(
        "Dress prompt requires Ocnoer to be present in the scene cast."
      );
    }

    const optionKeys = input.dressOptionKeys ?? [];

    if (optionKeys.length === 0) {
      throw new StoryRepositoryError(
        "Dress prompt requires at least one dress option."
      );
    }

    const uniqueOptionKeys = new Set<string>();

    for (const optionKey of optionKeys) {
      if (!optionKey) {
        throw new StoryRepositoryError(
          "Dress prompt option keys must not be empty."
        );
      }

      if (uniqueOptionKeys.has(optionKey)) {
        throw new StoryRepositoryError(
          "Dress prompt contains duplicate dress options."
        );
      }

      uniqueOptionKeys.add(optionKey);

      if (optionKey === BASE_DRESS_OPTION_KEY) {
        continue;
      }

      if (!character.dresses.some((dress) => dress.key === optionKey)) {
        throw new StoryRepositoryError(
          "Selected dress does not belong to the prompt character."
        );
      }
    }

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
  const emotion = character.emotions.find(
    (item) => item.key === input.emotionKey
  );

  if (!emotion) {
    throw new StoryRepositoryError(
      "Selected emotion does not belong to the speaker."
    );
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

      continue;
    }

    if (speaker.type === "dress_prompt") {
      const character = findCharacterOrThrow(snapshot, speaker.characterId);

      if (!isPrimaryLeftStageCharacterSlug(character.slug)) {
        throw new StoryRepositoryError(
          "Scene dialogue contains a dress prompt for an unsupported character."
        );
      }

      if (!nextCharacterIds.includes(character.id)) {
        throw new StoryRepositoryError(
          "Cannot remove Ocnoer from the scene cast while a dress prompt still references her."
        );
      }

      for (const optionKey of speaker.dressOptionKeys) {
        if (optionKey === BASE_DRESS_OPTION_KEY) {
          continue;
        }

        if (!character.dresses.some((dress) => dress.key === optionKey)) {
          throw new StoryRepositoryError(
            "Scene dialogue references a dress that no longer exists."
          );
        }
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

function updateDressEmotionOverrideReferences(
  character: CharacterDefinition,
  input: {
    previousEmotionKey: string;
    nextEmotionKey: string;
  }
) {
  character.dresses.forEach((dress) => {
    dress.emotionOverrides.forEach((override) => {
      if (override.emotionKey === input.previousEmotionKey) {
        override.emotionKey = input.nextEmotionKey;
        override.updatedAt = nowIsoString();
      }
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

function updateDressReferences(
  snapshot: StoryAuthoringSnapshot,
  input: {
    characterId: string;
    previousDressKey: string;
    nextDressKey: string;
  }
) {
  snapshot.chapters.forEach((chapter) => {
    chapter.scenes.forEach((scene) => {
      scene.dialogue.forEach((entry) => {
        if (
          entry.speaker.type === "dress_prompt" &&
          entry.speaker.characterId === input.characterId
        ) {
          entry.speaker.dressOptionKeys = entry.speaker.dressOptionKeys.map(
            (dressKey) =>
              dressKey === input.previousDressKey
                ? input.nextDressKey
                : dressKey
          );
        }
      });
    });
  });
}

function isDressReferenced(
  snapshot: StoryAuthoringSnapshot,
  input: {
    characterId: string;
    dressKey: string;
  }
) {
  return snapshot.chapters.some((chapter) =>
    chapter.scenes.some((scene) =>
      scene.dialogue.some(
        (entry) =>
          entry.speaker.type === "dress_prompt" &&
          entry.speaker.characterId === input.characterId &&
          entry.speaker.dressOptionKeys.includes(input.dressKey)
      )
    )
  );
}

function isCharacterReferenced(
  snapshot: StoryAuthoringSnapshot,
  characterId: string
) {
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

export async function getSceneDraft(sceneId: string) {
  const record = await findSceneDraftRecord(sceneId);

  if (!record) {
    return null;
  }

  const draft = toStoredSceneDraft(record);

  if (draft) {
    return draft;
  }

  await deleteSceneDraftRecords(sceneId, {
    ignoreMissingTable: true
  });

  return null;
}

export async function upsertSceneDraft(input: {
  sceneId: string;
  chapterId: string;
  sourceSceneUpdatedAt: string;
  payload: SceneDraftPayload;
}) {
  const parsedPayload = parseSceneDraftPayload(input.payload);

  if (!parsedPayload) {
    throw new StoryRepositoryError("Draft payload is invalid.");
  }

  const record = await upsertSceneDraftRecord({
    sceneId: input.sceneId,
    chapterId: input.chapterId,
    sourceSceneUpdatedAt: input.sourceSceneUpdatedAt,
    payload: parsedPayload
  });

  return toStoredSceneDraft(record);
}

export async function discardSceneDraft(sceneId: string) {
  await deleteSceneDraftRecords(sceneId);
}

function normalizeOptionalSceneDraftValue(value: string | null) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0 ? normalized : null;
}

function assertValidSceneDraftOrder(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new StoryRepositoryError(`${label} must be a positive integer.`);
  }

  return value;
}

function assertValidSceneDraftText(value: string, label: string) {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StoryRepositoryError(`${label} is required.`);
  }

  return normalized;
}

export async function saveSceneDraft(input: {
  chapterId: string;
  sceneId: string;
}) {
  const storedDraft = await getSceneDraft(input.sceneId);

  if (!storedDraft) {
    throw new StoryRepositoryError("Scene draft not found.");
  }

  if (storedDraft.chapterId !== input.chapterId) {
    throw new StoryRepositoryError("Scene draft no longer matches its chapter.");
  }

  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const draft = storedDraft.payload;
  const nextCharacterIds = [
    ...new Set(draft.scene.characterIds.map((id) => id.trim()).filter(Boolean))
  ];
  const nextSceneOrder = assertValidSceneDraftOrder(
    draft.scene.orderIndex,
    "Scene order"
  );
  const nextTitle = assertValidSceneDraftText(draft.scene.title, "Scene title");
  const backgroundImageAssetId = normalizeOptionalSceneDraftValue(
    draft.scene.backgroundImageAssetId
  );

  if (!backgroundImageAssetId) {
    throw new StoryRepositoryError("Background image is required.");
  }

  const backgroundMusicAssetId = normalizeOptionalSceneDraftValue(
    draft.scene.backgroundMusicAssetId
  );

  findBackgroundImageOrThrow(snapshot, backgroundImageAssetId);

  if (backgroundMusicAssetId) {
    findBackgroundMusicOrThrow(snapshot, backgroundMusicAssetId);
  }

  ensureSceneCharactersExist(snapshot, nextCharacterIds);

  const dialogueIds = new Set<string>();
  const existingEntriesById = new Map(
    scene.dialogue.map((entry) => [entry.id, entry])
  );
  const timestamp = nowIsoString();
  const nextDialogue: DialogueEntry[] = draft.dialogue.map((entry, index) => {
    const rawId = entry.id.trim();

    if (!rawId) {
      throw new StoryRepositoryError("Dialogue entry id is required.");
    }

    if (dialogueIds.has(rawId)) {
      throw new StoryRepositoryError("Dialogue draft contains duplicate rows.");
    }

    dialogueIds.add(rawId);

    const text = assertValidSceneDraftText(entry.text, "Dialogue text");
    const characterId = normalizeOptionalSceneDraftValue(entry.characterId);
    const emotionKey = normalizeOptionalSceneDraftValue(entry.emotionKey);
    const dressOptionKeys = [...new Set(entry.dressOptionKeys ?? [])];
    const existingEntry = existingEntriesById.get(rawId);

    assertDialogueSelection({
      snapshot,
      scene: {
        ...scene,
        characterIds: nextCharacterIds
      },
      speakerType: entry.speakerType,
      characterId,
      emotionKey,
      dressOptionKeys
    });

    if (entry.speakerType === "narrator") {
      return {
        id: isSceneDraftTempId(rawId) ? createEntityId("dialogue") : rawId,
        orderIndex: index + 1,
        text,
        speaker: {
          type: "narrator"
        },
        createdAt: existingEntry?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
    }

    if (!isSceneDraftTempId(rawId) && !existingEntry) {
      throw new StoryRepositoryError("Dialogue entry not found.");
    }

    if (entry.speakerType === "dress_prompt") {
      return {
        id: isSceneDraftTempId(rawId) ? createEntityId("dialogue") : rawId,
        orderIndex: index + 1,
        text,
        speaker: {
          type: "dress_prompt",
          characterId: characterId as string,
          dressOptionKeys
        },
        createdAt: existingEntry?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
    }

    return {
      id: isSceneDraftTempId(rawId) ? createEntityId("dialogue") : rawId,
      orderIndex: index + 1,
      text,
      speaker: {
        type: "character",
        characterId: characterId as string,
        emotionKey: emotionKey as string
      },
      createdAt: existingEntry?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
  });

  const orderChanged = nextSceneOrder !== scene.orderIndex;

  if (!orderChanged) {
    ensureUniqueSceneOrder(chapter, nextSceneOrder, scene.id);
  }

  scene.title = nextTitle;
  scene.backgroundImageAssetId = backgroundImageAssetId;
  scene.backgroundMusicAssetId = backgroundMusicAssetId;
  scene.characterIds = nextCharacterIds;
  scene.dialogue = nextDialogue;
  scene.updatedAt = timestamp;
  chapter.updatedAt = timestamp;

  if (orderChanged) {
    chapter.scenes = moveItemWithinOrderedScope(
      chapter.scenes,
      scene.id,
      nextSceneOrder
    );
  } else {
    scene.orderIndex = nextSceneOrder;
  }

  await commitChapterScopedSnapshot(snapshot, chapter.id);
  await discardSceneDraft(input.sceneId);

  return {
    sceneUpdatedAt: scene.updatedAt,
    payload: createSceneDraftPayload(scene)
  };
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
    dresses: [],
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
      "Cannot delete a character while a scene cast or dialogue entry still references it."
    );
  }

  snapshot.characters = snapshot.characters.filter(
    (item) => item.id !== characterId
  );
  await commitSnapshot(snapshot);
  await removeStorageObjects(
    [
      ...character.emotions.map((emotion) => emotion.imagePath),
      ...character.dresses.flatMap((dress) =>
        dress.emotionOverrides.map((override) => override.imagePath)
      )
    ]
  );
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
  const emotion = character.emotions.find(
    (item) => item.id === input.emotionId
  );

  if (!emotion) {
    throw new StoryRepositoryError("Emotion not found.");
  }

  const previousEmotionKey = emotion.key;
  const nextEmotionKey = normalizeSlugInput(
    input.emotionKey,
    input.emotionLabel
  );

  ensureUniqueEmotionKey(character, nextEmotionKey, emotion.id);

  emotion.key = nextEmotionKey;
  emotion.label = input.emotionLabel.trim();
  emotion.updatedAt = nowIsoString();
  let previousImagePathToDelete: string | null = null;

  if (input.imageFile && input.imageFile.size > 0) {
    assertImageFile(input.imageFile, "Emotion image");
    previousImagePathToDelete = emotion.imagePath;
    emotion.imagePath = await uploadFileToStorage({
      file: input.imageFile,
      objectPath: `media/characters/${character.id}/${emotion.id}/${createEntityId("file")}`,
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
    updateDressEmotionOverrideReferences(character, {
      previousEmotionKey,
      nextEmotionKey
    });
  }

  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);

  if (
    previousImagePathToDelete &&
    previousImagePathToDelete !== emotion.imagePath
  ) {
    await removeStorageObjects([previousImagePathToDelete]);
  }

  return character;
}

export async function setDefaultCharacterEmotion(input: {
  characterId: string;
  emotionId: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const emotion = character.emotions.find(
    (item) => item.id === input.emotionId
  );

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
  const emotion = character.emotions.find(
    (item) => item.id === input.emotionId
  );

  if (!emotion) {
    throw new StoryRepositoryError("Emotion not found.");
  }

  if (character.emotions.length === 1) {
    throw new StoryRepositoryError(
      "A character must always have at least one emotion."
    );
  }

  if (
    isEmotionReferenced(snapshot, {
      characterId: character.id,
      emotionKey: emotion.key
    })
  ) {
    throw new StoryRepositoryError(
      "Cannot delete an emotion while dialogue still references this character emotion."
    );
  }

  character.emotions = character.emotions.filter(
    (item) => item.id !== input.emotionId
  );
  character.dresses.forEach((dress) => {
    dress.emotionOverrides = dress.emotionOverrides.filter(
      (override) => override.emotionKey !== emotion.key
    );
  });

  if (character.defaultEmotionKey === emotion.key) {
    character.defaultEmotionKey = character.emotions[0].key;
  }

  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);
  await removeStorageObjects([emotion.imagePath]);
}

export async function createCharacterDress(input: {
  characterId: string;
  dressKey: string;
  dressLabel: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const dressId = createEntityId("dress");
  const normalizedDressKey = normalizeSlugInput(
    input.dressKey,
    input.dressLabel
  );

  if (normalizedDressKey === BASE_DRESS_OPTION_KEY) {
    throw new StoryRepositoryError(
      `"${BASE_DRESS_OPTION_KEY}" is reserved for the default dress option.`
    );
  }

  ensureUniqueDressKey(character, normalizedDressKey);

  const timestamp = nowIsoString();

  character.dresses.push({
    id: dressId,
    key: normalizedDressKey,
    label: input.dressLabel.trim(),
    emotionOverrides: [],
    createdAt: timestamp,
    updatedAt: timestamp
  });
  character.updatedAt = timestamp;

  await commitSnapshot(snapshot);

  return character;
}

export async function updateCharacterDress(input: {
  characterId: string;
  dressId: string;
  dressKey: string;
  dressLabel: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const dress = character.dresses.find((item) => item.id === input.dressId);

  if (!dress) {
    throw new StoryRepositoryError("Dress not found.");
  }

  const previousDressKey = dress.key;
  const nextDressKey = normalizeSlugInput(input.dressKey, input.dressLabel);

  if (nextDressKey === BASE_DRESS_OPTION_KEY) {
    throw new StoryRepositoryError(
      `"${BASE_DRESS_OPTION_KEY}" is reserved for the default dress option.`
    );
  }

  ensureUniqueDressKey(character, nextDressKey, dress.id);

  dress.key = nextDressKey;
  dress.label = input.dressLabel.trim();
  dress.updatedAt = nowIsoString();
  character.updatedAt = nowIsoString();

  if (previousDressKey !== nextDressKey) {
    updateDressReferences(snapshot, {
      characterId: character.id,
      previousDressKey,
      nextDressKey
    });
  }

  await commitSnapshot(snapshot);

  return character;
}

export async function deleteCharacterDress(input: {
  characterId: string;
  dressId: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const dress = character.dresses.find((item) => item.id === input.dressId);

  if (!dress) {
    throw new StoryRepositoryError("Dress not found.");
  }

  if (
    isDressReferenced(snapshot, {
      characterId: character.id,
      dressKey: dress.key
    })
  ) {
    throw new StoryRepositoryError(
      "Cannot delete a dress while a dress prompt still references it."
    );
  }

  character.dresses = character.dresses.filter((item) => item.id !== dress.id);
  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);
  await removeStorageObjects(
    dress.emotionOverrides.map((override) => override.imagePath)
  );
}

export async function upsertCharacterDressEmotionOverride(input: {
  characterId: string;
  dressId: string;
  emotionKey: string;
  imageFile: File;
}) {
  assertRequiredFile(input.imageFile, "Dress image");
  assertImageFile(input.imageFile, "Dress image");

  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const dress = character.dresses.find((item) => item.id === input.dressId);

  if (!dress) {
    throw new StoryRepositoryError("Dress not found.");
  }

  if (!character.emotions.some((emotion) => emotion.key === input.emotionKey)) {
    throw new StoryRepositoryError(
      "Dress override emotion must belong to the character."
    );
  }

  const existingOverride =
    dress.emotionOverrides.find(
      (override) => override.emotionKey === input.emotionKey
    ) ?? null;
  const previousImagePath = existingOverride?.imagePath ?? null;
  const objectPath = existingOverride
    ? `media/characters/${character.id}/dresses/${dress.id}/${existingOverride.id}/${createEntityId("file")}`
    : `media/characters/${character.id}/dresses/${dress.id}/${createEntityId("override")}`;
  const nextImagePath = await uploadFileToStorage({
    file: input.imageFile,
    objectPath,
    cacheControl: "31536000"
  });
  const timestamp = nowIsoString();

  if (existingOverride) {
    existingOverride.imagePath = nextImagePath;
    existingOverride.updatedAt = timestamp;
  } else {
    dress.emotionOverrides.push({
      id: createEntityId("dress_override"),
      emotionKey: input.emotionKey,
      imagePath: nextImagePath,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  dress.updatedAt = timestamp;
  character.updatedAt = timestamp;

  await commitSnapshot(snapshot);

  if (previousImagePath && previousImagePath !== nextImagePath) {
    await removeStorageObjects([previousImagePath]);
  }

  return character;
}

export async function deleteCharacterDressEmotionOverride(input: {
  characterId: string;
  dressId: string;
  emotionKey: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const character = findCharacterOrThrow(snapshot, input.characterId);
  const dress = character.dresses.find((item) => item.id === input.dressId);

  if (!dress) {
    throw new StoryRepositoryError("Dress not found.");
  }

  const override = dress.emotionOverrides.find(
    (item) => item.emotionKey === input.emotionKey
  );

  if (!override) {
    throw new StoryRepositoryError("Dress emotion override not found.");
  }

  dress.emotionOverrides = dress.emotionOverrides.filter(
    (item) => item.id !== override.id
  );
  dress.updatedAt = nowIsoString();
  character.updatedAt = nowIsoString();

  await commitSnapshot(snapshot);
  await removeStorageObjects([override.imagePath]);
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
  let previousFilePathToDelete: string | null = null;

  if (input.file && input.file.size > 0) {
    assertImageFile(input.file, "Background image");
    previousFilePathToDelete = asset.filePath;
    asset.filePath = await uploadFileToStorage({
      file: input.file,
      objectPath: `media/background-images/${asset.id}/${createEntityId("file")}`,
      cacheControl: "31536000"
    });
  }

  await commitSnapshot(snapshot);

  if (previousFilePathToDelete && previousFilePathToDelete !== asset.filePath) {
    await removeStorageObjects([previousFilePathToDelete]);
  }

  return asset;
}

export async function deleteBackgroundImageAsset(assetId: string) {
  const snapshot = await loadAuthoringSnapshot();
  const asset = findBackgroundImageOrThrow(snapshot, assetId);

  if (isBackgroundImageReferenced(snapshot, asset.id)) {
    throw new StoryRepositoryError(
      "Cannot delete a background image while one or more scenes still reference it."
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
      "Cannot delete a music track while one or more scenes still reference it."
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
  const orderChanged = input.orderIndex !== chapter.orderIndex;

  ensureUniqueChapterSlug(snapshot, normalizedSlug, chapter.id);

  if (!orderChanged) {
    ensureUniqueChapterOrder(snapshot, input.orderIndex, chapter.id);
  }

  chapter.title = input.title.trim();
  chapter.slug = normalizedSlug;
  chapter.updatedAt = nowIsoString();

  if (orderChanged) {
    snapshot.chapters = moveItemWithinOrderedScope(
      snapshot.chapters,
      chapter.id,
      input.orderIndex
    );
  } else {
    chapter.orderIndex = input.orderIndex;
  }

  await commitSnapshot(snapshot);

  return chapter;
}

export async function deleteChapter(chapterId: string) {
  const snapshot = await loadAuthoringSnapshot();
  findChapterOrThrow(snapshot, chapterId);
  snapshot.chapters = snapshot.chapters.filter(
    (chapter) => chapter.id !== chapterId
  );
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
  const orderChanged = input.orderIndex !== scene.orderIndex;

  if (!orderChanged) {
    ensureUniqueSceneOrder(chapter, input.orderIndex, scene.id);
  }
  findBackgroundImageOrThrow(snapshot, input.backgroundImageAssetId);

  if (input.backgroundMusicAssetId) {
    findBackgroundMusicOrThrow(snapshot, input.backgroundMusicAssetId);
  }

  ensureSceneCharactersExist(snapshot, nextCharacterIds);
  assertSceneDialogueStillValid(snapshot, scene, nextCharacterIds);

  scene.title = input.title.trim();
  scene.backgroundImageAssetId = input.backgroundImageAssetId;
  scene.backgroundMusicAssetId = input.backgroundMusicAssetId;
  scene.characterIds = nextCharacterIds;
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();

  if (orderChanged) {
    chapter.scenes = moveItemWithinOrderedScope(
      chapter.scenes,
      scene.id,
      input.orderIndex
    );
  } else {
    scene.orderIndex = input.orderIndex;
  }

  await commitSnapshot(snapshot);

  return scene;
}

export async function deleteScene(input: {
  chapterId: string;
  sceneId: string;
}) {
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
  orderIndex?: number;
  speakerType: "narrator" | "character" | "dress_prompt";
  characterId: string | null;
  emotionKey: string | null;
  dressOptionKeys?: string[];
  text: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const orderIndex = input.orderIndex ?? getNextOrderIndex(scene.dialogue);

  ensureUniqueDialogueOrder(scene, orderIndex);
  assertDialogueSelection({
    snapshot,
    scene,
    speakerType: input.speakerType,
    characterId: input.characterId,
    emotionKey: input.emotionKey,
    dressOptionKeys: input.dressOptionKeys
  });

  const entry: DialogueEntry = {
    id: createEntityId("dialogue"),
    orderIndex,
    text: input.text.trim(),
    speaker:
      input.speakerType === "narrator"
        ? {
            type: "narrator"
          }
        : input.speakerType === "dress_prompt"
          ? {
              type: "dress_prompt",
              characterId: input.characterId as string,
              dressOptionKeys: [...new Set(input.dressOptionKeys ?? [])]
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
  await commitChapterScopedSnapshot(snapshot, chapter.id);

  return entry;
}

export async function updateDialogueEntry(input: {
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  orderIndex: number;
  speakerType: "narrator" | "character" | "dress_prompt";
  characterId: string | null;
  emotionKey: string | null;
  dressOptionKeys?: string[];
  text: string;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const entry = findDialogueEntryOrThrow(scene, input.dialogueEntryId);
  const orderChanged = input.orderIndex !== entry.orderIndex;

  if (!orderChanged) {
    ensureUniqueDialogueOrder(scene, input.orderIndex, entry.id);
  }
  assertDialogueSelection({
    snapshot,
    scene,
    speakerType: input.speakerType,
    characterId: input.characterId,
    emotionKey: input.emotionKey,
    dressOptionKeys: input.dressOptionKeys
  });

  entry.text = input.text.trim();
  entry.speaker =
    input.speakerType === "narrator"
      ? {
          type: "narrator"
        }
      : input.speakerType === "dress_prompt"
        ? {
            type: "dress_prompt",
            characterId: input.characterId as string,
            dressOptionKeys: [...new Set(input.dressOptionKeys ?? [])]
          }
      : {
          type: "character",
          characterId: input.characterId as string,
          emotionKey: input.emotionKey as string
        };
  entry.updatedAt = nowIsoString();
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();

  if (orderChanged) {
    scene.dialogue = moveItemWithinOrderedScope(
      scene.dialogue,
      entry.id,
      input.orderIndex
    );
  } else {
    entry.orderIndex = input.orderIndex;
  }

  await commitChapterScopedSnapshot(snapshot, chapter.id);

  return entry;
}

export async function reorderDialogueEntry(input: {
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  targetOrderIndex: number;
}) {
  const snapshot = await loadAuthoringSnapshot();
  const chapter = findChapterOrThrow(snapshot, input.chapterId);
  const scene = findSceneOrThrow(chapter, input.sceneId);
  const entry = findDialogueEntryOrThrow(scene, input.dialogueEntryId);

  scene.dialogue = moveItemWithinOrderedScope(
    scene.dialogue,
    entry.id,
    input.targetOrderIndex
  );
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();

  await commitChapterScopedSnapshot(snapshot, chapter.id);

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
  scene.dialogue = scene.dialogue.filter(
    (entry) => entry.id !== input.dialogueEntryId
  );
  scene.updatedAt = nowIsoString();
  chapter.updatedAt = nowIsoString();
  await commitChapterScopedSnapshot(snapshot, chapter.id);
}
