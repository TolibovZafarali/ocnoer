import type {
  BackgroundImageAsset,
  BackgroundMusicTrack,
  CharacterDefinition,
  RuntimeAssetsManifest,
  RuntimeBackgroundImage,
  RuntimeBackgroundMusic,
  RuntimeChapterBundle,
  RuntimeCharacter,
  RuntimeCharactersManifest,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene,
  RuntimeStageCharacter,
  StoryAuthoringSnapshot,
  StoryRuntimeArtifacts
} from "@/lib/story/types";
import { STORY_SCHEMA_VERSION } from "@/lib/story/types";

function toRuntimeCharacter(character: CharacterDefinition): RuntimeCharacter {
  const defaultEmotion = character.emotions.find(
    (emotion) => emotion.key === character.defaultEmotionKey
  );

  if (!defaultEmotion) {
    throw new Error(`Character "${character.name}" is missing its default emotion.`);
  }

  return {
    id: character.id,
    name: character.name,
    slug: character.slug,
    bio: character.bio,
    defaultEmotionKey: character.defaultEmotionKey,
    defaultEmotionImagePath: defaultEmotion.imagePath,
    emotions: character.emotions.map((emotion) => ({
      key: emotion.key,
      label: emotion.label,
      imagePath: emotion.imagePath
    }))
  };
}

function toRuntimeBackgroundImage(asset: BackgroundImageAsset): RuntimeBackgroundImage {
  return {
    id: asset.id,
    label: asset.label,
    slug: asset.slug,
    altText: asset.altText,
    filePath: asset.filePath
  };
}

function toRuntimeBackgroundMusic(asset: BackgroundMusicTrack): RuntimeBackgroundMusic {
  return {
    id: asset.id,
    label: asset.label,
    slug: asset.slug,
    filePath: asset.filePath
  };
}

function cloneStageCharacter(
  value: RuntimeStageCharacter | null
): RuntimeStageCharacter | null {
  return value ? { ...value } : null;
}

function createStageCharacter(
  character: RuntimeCharacter,
  emotionKey: string
): RuntimeStageCharacter {
  const emotion = character.emotions.find((item) => item.key === emotionKey);

  if (!emotion) {
    throw new Error(
      `Character "${character.name}" is missing emotion "${emotionKey}".`
    );
  }

  return {
    characterId: character.id,
    characterName: character.name,
    characterSlug: character.slug,
    emotionKey: emotion.key,
    emotionLabel: emotion.label,
    imagePath: emotion.imagePath
  };
}

function compileScene(input: {
  scene: StoryAuthoringSnapshot["chapters"][number]["scenes"][number];
  charactersById: Map<string, RuntimeCharacter>;
  backgroundImagesById: Map<string, RuntimeBackgroundImage>;
  backgroundMusicById: Map<string, RuntimeBackgroundMusic>;
}): RuntimeScene {
  const backgroundImage = input.backgroundImagesById.get(
    input.scene.backgroundImageAssetId
  );

  if (!backgroundImage) {
    throw new Error(`Scene "${input.scene.title}" is missing its background image.`);
  }

  const backgroundMusic = input.scene.backgroundMusicAssetId
    ? input.backgroundMusicById.get(input.scene.backgroundMusicAssetId) ?? null
    : null;

  const characterPool = input.scene.characterIds.map((characterId) => {
    const character = input.charactersById.get(characterId);

    if (!character) {
      throw new Error(`Scene "${input.scene.title}" references an unknown character.`);
    }

    return character;
  });

  const ocnoer = characterPool.find((character) => character.slug === "ocnoer") ?? null;
  let leftStage = ocnoer
    ? createStageCharacter(ocnoer, ocnoer.defaultEmotionKey)
    : null;
  let rightStage: RuntimeStageCharacter | null = null;

  const dialogue = [...input.scene.dialogue]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((entry): RuntimeDialogueEntry => {
      if (entry.speaker.type === "narrator") {
        return {
          id: entry.id,
          orderIndex: entry.orderIndex,
          text: entry.text,
          speaker: {
            type: "narrator"
          },
          stage: {
            left: cloneStageCharacter(leftStage),
            right: cloneStageCharacter(rightStage)
          }
        };
      }

      const speakingCharacter = input.charactersById.get(entry.speaker.characterId);

      if (!speakingCharacter) {
        throw new Error(`Dialogue entry "${entry.id}" references an unknown character.`);
      }

      const stageCharacter = createStageCharacter(
        speakingCharacter,
        entry.speaker.emotionKey
      );

      if (speakingCharacter.slug === "ocnoer") {
        leftStage = stageCharacter;
      } else {
        if (ocnoer && (!leftStage || leftStage.characterId !== ocnoer.id)) {
          leftStage = createStageCharacter(
            ocnoer,
            leftStage?.characterId === ocnoer.id
              ? leftStage.emotionKey
              : ocnoer.defaultEmotionKey
          );
        }

        rightStage = stageCharacter;
      }

      return {
        id: entry.id,
        orderIndex: entry.orderIndex,
        text: entry.text,
        speaker: {
          type: "character",
          characterId: speakingCharacter.id,
          characterName: speakingCharacter.name,
          characterSlug: speakingCharacter.slug,
          emotionKey: stageCharacter.emotionKey,
          emotionLabel: stageCharacter.emotionLabel,
          emotionImagePath: stageCharacter.imagePath
        },
        stage: {
          left: cloneStageCharacter(leftStage),
          right: cloneStageCharacter(rightStage)
        }
      };
    });

  return {
    id: input.scene.id,
    title: input.scene.title,
    orderIndex: input.scene.orderIndex,
    backgroundImage,
    backgroundMusic,
    characterPool,
    dialogue
  };
}

export function compileRuntimeStory(input: {
  snapshot: StoryAuthoringSnapshot;
  generatedAt?: string;
  bucket: string;
  runtimePrefix: string;
}): StoryRuntimeArtifacts {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const characters = [...input.snapshot.characters]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(toRuntimeCharacter);
  const backgroundImages = [...input.snapshot.backgroundImages]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(toRuntimeBackgroundImage);
  const backgroundMusicTracks = [...input.snapshot.backgroundMusicTracks]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(toRuntimeBackgroundMusic);

  const charactersById = new Map(
    characters.map((character) => [character.id, character])
  );
  const backgroundImagesById = new Map(
    backgroundImages.map((asset) => [asset.id, asset])
  );
  const backgroundMusicById = new Map(
    backgroundMusicTracks.map((asset) => [asset.id, asset])
  );

  const sortedChapters = [...input.snapshot.chapters].sort(
    (left, right) => left.orderIndex - right.orderIndex
  );

  const chapterBundles = sortedChapters.map((chapter, index) => {
    const path = `${input.bucket}/${input.runtimePrefix}/chapters/${chapter.id}.json`;
    const scenes = [...chapter.scenes]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((scene) =>
        compileScene({
          scene,
          charactersById,
          backgroundImagesById,
          backgroundMusicById
        })
      );

    return {
      chapterId: chapter.id,
      path,
      bundle: {
        schemaVersion: STORY_SCHEMA_VERSION,
        generatedAt,
        chapter: {
          id: chapter.id,
          title: chapter.title,
          slug: chapter.slug,
          orderIndex: chapter.orderIndex,
          scenes
        },
        nextChapterId: sortedChapters[index + 1]?.id ?? null
      } satisfies RuntimeChapterBundle
    };
  });

  const charactersPath = `${input.bucket}/${input.runtimePrefix}/characters.json`;
  const assetsPath = `${input.bucket}/${input.runtimePrefix}/assets.json`;
  const chaptersPath = `${input.bucket}/${input.runtimePrefix}/manifest.json`;

  const manifest: RuntimeManifest = {
    schemaVersion: STORY_SCHEMA_VERSION,
    generatedAt,
    firstChapterId: sortedChapters[0]?.id ?? null,
    chaptersPath,
    charactersPath,
    assetsPath,
    chapters: sortedChapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      slug: chapter.slug,
      orderIndex: chapter.orderIndex,
      bundlePath: `${input.bucket}/${input.runtimePrefix}/chapters/${chapter.id}.json`
    }))
  };

  const charactersManifest: RuntimeCharactersManifest = {
    schemaVersion: STORY_SCHEMA_VERSION,
    generatedAt,
    characters
  };

  const assetsManifest: RuntimeAssetsManifest = {
    schemaVersion: STORY_SCHEMA_VERSION,
    generatedAt,
    backgroundImages,
    backgroundMusicTracks
  };

  return {
    manifest,
    charactersManifest,
    assetsManifest,
    chapterBundles
  };
}

