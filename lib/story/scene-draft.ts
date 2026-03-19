import type {
  SceneDefinition,
  SceneDraftDialogueEntry,
  SceneDraftPayload
} from "@/lib/story/types";

export const SCENE_DRAFT_TEMP_ID_PREFIX = "draft:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown) {
  return value == null ? null : asString(value);
}

function asInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string"
  );

  return strings.length === value.length ? strings : null;
}

function parseSceneDraftDialogueEntry(
  value: unknown
): SceneDraftDialogueEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const speakerType = asString(value.speakerType);
  const text = asString(value.text);

  if (
    !id ||
    text == null ||
    (speakerType !== "narrator" && speakerType !== "character")
  ) {
    return null;
  }

  return {
    id,
    speakerType,
    characterId: asNullableString(value.characterId),
    emotionKey: asNullableString(value.emotionKey),
    text
  };
}

export function createSceneDraftPayload(
  scene: SceneDefinition
): SceneDraftPayload {
  return {
    scene: {
      title: scene.title,
      orderIndex: scene.orderIndex,
      backgroundImageAssetId: scene.backgroundImageAssetId,
      backgroundMusicAssetId: scene.backgroundMusicAssetId,
      characterIds: [...scene.characterIds]
    },
    dialogue: scene.dialogue.map((entry) => ({
      id: entry.id,
      speakerType: entry.speaker.type,
      characterId:
        entry.speaker.type === "character" ? entry.speaker.characterId : null,
      emotionKey:
        entry.speaker.type === "character" ? entry.speaker.emotionKey : null,
      text: entry.text
    }))
  };
}

export function parseSceneDraftPayload(
  value: unknown
): SceneDraftPayload | null {
  if (!isRecord(value) || !isRecord(value.scene) || !Array.isArray(value.dialogue)) {
    return null;
  }

  const title = asString(value.scene.title);
  const orderIndex = asInteger(value.scene.orderIndex);
  const backgroundImageAssetId = asString(value.scene.backgroundImageAssetId);
  const backgroundMusicAssetId = asNullableString(
    value.scene.backgroundMusicAssetId
  );
  const characterIds = asStringArray(value.scene.characterIds);
  const dialogue = value.dialogue
    .map(parseSceneDraftDialogueEntry)
    .filter(
      (entry): entry is SceneDraftDialogueEntry =>
        entry !== null
    );

  if (
    title == null ||
    orderIndex == null ||
    backgroundImageAssetId == null ||
    characterIds == null ||
    dialogue.length !== value.dialogue.length
  ) {
    return null;
  }

  return {
    scene: {
      title,
      orderIndex,
      backgroundImageAssetId,
      backgroundMusicAssetId,
      characterIds
    },
    dialogue
  };
}

export function isSceneDraftTempId(id: string) {
  return id.startsWith(SCENE_DRAFT_TEMP_ID_PREFIX);
}
