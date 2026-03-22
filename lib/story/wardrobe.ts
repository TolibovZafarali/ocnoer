import type {
  CharacterDefinition,
  RuntimeCharacter
} from "@/lib/story/types";
import { isPrimaryLeftStageCharacterSlug } from "@/lib/story/staging";

export const BASE_DRESS_OPTION_KEY = "__base__";
export const BASE_DRESS_OPTION_LABEL = "Default Dress";

type CharacterWithDressState =
  | CharacterDefinition
  | RuntimeCharacter;

function getDefaultEmotionImagePath(character: CharacterWithDressState) {
  const runtimeCharacter = character as RuntimeCharacter;

  if (typeof runtimeCharacter.defaultEmotionImagePath === "string") {
    return runtimeCharacter.defaultEmotionImagePath;
  }

  return (
    character.emotions.find(
      (emotion) => emotion.key === character.defaultEmotionKey
    )?.imagePath ??
    character.emotions[0]?.imagePath ??
    null
  );
}

export function getDressBranchFlagKey(characterId: string) {
  return `dress:${characterId}`;
}

export function getSelectedDressKey(
  branchFlags: Record<string, boolean | number | string>,
  characterId: string
) {
  const value = branchFlags[getDressBranchFlagKey(characterId)];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

export function applySceneDressCarrySelection(input: {
  scene:
    | {
        carryOcnoerDressSelection: boolean;
        characterPool: Array<{
          id: string;
          slug: string;
        }>;
      }
    | null;
  branchFlags: Record<string, boolean | number | string>;
}) {
  if (!input.scene || input.scene.carryOcnoerDressSelection) {
    return input.branchFlags;
  }

  const ocnoerCharacter =
    input.scene.characterPool.find((character) =>
      isPrimaryLeftStageCharacterSlug(character.slug)
    ) ?? null;

  if (!ocnoerCharacter) {
    return input.branchFlags;
  }

  const dressBranchFlagKey = getDressBranchFlagKey(ocnoerCharacter.id);

  if (input.branchFlags[dressBranchFlagKey] === BASE_DRESS_OPTION_KEY) {
    return input.branchFlags;
  }

  return {
    ...input.branchFlags,
    [dressBranchFlagKey]: BASE_DRESS_OPTION_KEY
  };
}

export function isBaseDressOptionKey(value: string) {
  return value === BASE_DRESS_OPTION_KEY;
}

export function resolveDressImagePath(input: {
  character: CharacterWithDressState;
  emotionKey: string;
  dressKey: string | null | undefined;
}) {
  const baseEmotion =
    input.character.emotions.find((emotion) => emotion.key === input.emotionKey) ??
    null;

  if (!baseEmotion) {
    return null;
  }

  if (!input.dressKey || isBaseDressOptionKey(input.dressKey)) {
    return baseEmotion.imagePath;
  }

  const dress =
    input.character.dresses.find((item) => item.key === input.dressKey) ?? null;
  const override =
    dress?.emotionOverrides.find(
      (emotion) => emotion.emotionKey === input.emotionKey
    ) ?? null;

  return override?.imagePath ?? baseEmotion.imagePath;
}

export function getDressPreviewImagePath(input: {
  character: CharacterWithDressState;
  dressKey: string;
}) {
  const defaultImagePath = getDefaultEmotionImagePath(input.character);

  if (isBaseDressOptionKey(input.dressKey)) {
    return defaultImagePath;
  }

  const dress =
    input.character.dresses.find((item) => item.key === input.dressKey) ?? null;

  if (!dress) {
    return defaultImagePath;
  }

  const defaultOverride =
    dress.emotionOverrides.find(
      (override) => override.emotionKey === input.character.defaultEmotionKey
    ) ?? null;

  return (
    defaultOverride?.imagePath ??
    dress.emotionOverrides[0]?.imagePath ??
    defaultImagePath
  );
}
