import type {
  BackgroundImageAsset,
  BackgroundMusicTrack,
  CharacterDefinition,
  ChapterDefinition,
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
import { PRIMARY_LEFT_STAGE_CHARACTER_SLUG } from "@/lib/story/staging";
import { STORY_SCHEMA_VERSION } from "@/lib/story/types";
import {
  BASE_DRESS_OPTION_KEY,
  BASE_DRESS_OPTION_LABEL,
  getDressPreviewImagePath
} from "@/lib/story/wardrobe";

type RuntimeCompileContext = {
  characters: RuntimeCharacter[];
  backgroundImages: RuntimeBackgroundImage[];
  backgroundMusicTracks: RuntimeBackgroundMusic[];
  charactersById: Map<string, RuntimeCharacter>;
  backgroundImagesById: Map<string, RuntimeBackgroundImage>;
  backgroundMusicById: Map<string, RuntimeBackgroundMusic>;
  sortedChapters: ChapterDefinition[];
};

function toRuntimeCharacter(character: CharacterDefinition): RuntimeCharacter {
  const defaultEmotion = character.emotions.find(
    (emotion) => emotion.key === character.defaultEmotionKey
  );

  if (!defaultEmotion) {
    throw new Error(
      `Character "${character.name}" is missing its default emotion.`
    );
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
      imagePath: emotion.imagePath,
      imageDerivatives: emotion.imageDerivatives
    })),
    dresses: character.dresses.map((dress) => ({
      key: dress.key,
      label: dress.label,
      emotionOverrides: dress.emotionOverrides.map((override) => ({
        emotionKey: override.emotionKey,
        imagePath: override.imagePath,
        imageDerivatives: override.imageDerivatives
      }))
    }))
  };
}

function toRuntimeBackgroundImage(
  asset: BackgroundImageAsset
): RuntimeBackgroundImage {
  return {
    id: asset.id,
    label: asset.label,
    slug: asset.slug,
    altText: asset.altText,
    filePath: asset.filePath
  };
}

function toRuntimeBackgroundMusic(
  asset: BackgroundMusicTrack
): RuntimeBackgroundMusic {
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
    imagePath: emotion.imagePath,
    imageDerivatives: emotion.imageDerivatives
  };
}

function isPrimaryLeftStageCharacter(character: RuntimeCharacter) {
  return character.slug === PRIMARY_LEFT_STAGE_CHARACTER_SLUG;
}

function createDressPromptOptions(
  character: RuntimeCharacter,
  dressOptionKeys: string[]
) {
  return dressOptionKeys.map((dressKey) => ({
    key: dressKey,
    label:
      dressKey === BASE_DRESS_OPTION_KEY
        ? BASE_DRESS_OPTION_LABEL
        : (character.dresses.find((dress) => dress.key === dressKey)?.label ??
          dressKey),
    previewImagePath: getDressPreviewImagePath({
      character,
      dressKey
    })
  }));
}

function compileScene(input: {
  scene: StoryAuthoringSnapshot["chapters"][number]["scenes"][number];
  charactersById: Map<string, RuntimeCharacter>;
  backgroundImagesById: Map<string, RuntimeBackgroundImage>;
  backgroundMusicById: Map<string, RuntimeBackgroundMusic>;
}): RuntimeScene {
  const backgroundImage = input.scene.backgroundImageAssetId
    ? (input.backgroundImagesById.get(input.scene.backgroundImageAssetId) ??
      null)
    : null;

  if (input.scene.backgroundImageAssetId && !backgroundImage) {
    throw new Error(
      `Scene "${input.scene.title}" references an unknown background image.`
    );
  }

  const backgroundMusic = input.scene.backgroundMusicAssetId
    ? (input.backgroundMusicById.get(input.scene.backgroundMusicAssetId) ??
      null)
    : null;

  const characterPool = input.scene.characterIds.map((characterId) => {
    const character = input.charactersById.get(characterId);

    if (!character) {
      throw new Error(
        `Scene "${input.scene.title}" references an unknown character.`
      );
    }

    return character;
  });

  // The current reader keeps the configured primary character anchored on the
  // left stage whenever that character is part of the scene cast.
  const leftStageAnchor =
    characterPool.find((character) => isPrimaryLeftStageCharacter(character)) ??
    null;
  let leftStage = leftStageAnchor
    ? createStageCharacter(leftStageAnchor, leftStageAnchor.defaultEmotionKey)
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

      if (entry.speaker.type === "dress_prompt") {
        const promptCharacter = input.charactersById.get(
          entry.speaker.characterId
        );

        if (!promptCharacter) {
          throw new Error(
            `Dialogue entry "${entry.id}" references an unknown dress prompt character.`
          );
        }

        return {
          id: entry.id,
          orderIndex: entry.orderIndex,
          text: entry.text,
          speaker: {
            type: "dress_prompt",
            characterId: promptCharacter.id,
            characterName: promptCharacter.name,
            characterSlug: promptCharacter.slug,
            dressOptions: createDressPromptOptions(
              promptCharacter,
              entry.speaker.dressOptionKeys
            )
          },
          stage: {
            left: cloneStageCharacter(leftStage),
            right: cloneStageCharacter(rightStage)
          }
        };
      }

      if (entry.speaker.type === "cat_name_prompt") {
        const promptCharacter = input.charactersById.get(
          entry.speaker.characterId
        );

        if (!promptCharacter) {
          throw new Error(
            `Dialogue entry "${entry.id}" references an unknown cat name prompt character.`
          );
        }

        return {
          id: entry.id,
          orderIndex: entry.orderIndex,
          text: entry.text,
          speaker: {
            type: "cat_name_prompt",
            characterId: promptCharacter.id,
            characterName: promptCharacter.name,
            characterSlug: promptCharacter.slug
          },
          stage: {
            left: cloneStageCharacter(leftStage),
            right: cloneStageCharacter(rightStage)
          }
        };
      }

      const speakingCharacter = input.charactersById.get(
        entry.speaker.characterId
      );

      if (!speakingCharacter) {
        throw new Error(
          `Dialogue entry "${entry.id}" references an unknown character.`
        );
      }

      const stageCharacter = createStageCharacter(
        speakingCharacter,
        entry.speaker.emotionKey
      );

      if (isPrimaryLeftStageCharacter(speakingCharacter)) {
        leftStage = stageCharacter;
      } else if (!leftStageAnchor) {
        if (
          !leftStage ||
          leftStage.characterId === stageCharacter.characterId
        ) {
          leftStage = stageCharacter;
        } else {
          rightStage = stageCharacter;
        }
      } else {
        if (
          leftStageAnchor &&
          (!leftStage || leftStage.characterId !== leftStageAnchor.id)
        ) {
          leftStage = createStageCharacter(
            leftStageAnchor,
            leftStage?.characterId === leftStageAnchor.id
              ? leftStage.emotionKey
              : leftStageAnchor.defaultEmotionKey
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

  const dialogueIndexById = new Map(
    dialogue.map((entry, index) => [entry.id, index])
  );
  const backgroundMusicCues = [...(input.scene.backgroundMusicCues ?? [])]
    .map((cue) => {
      const dialogueIndex = dialogueIndexById.get(cue.afterDialogueEntryId);

      if (dialogueIndex == null) {
        throw new Error(
          `Scene "${input.scene.title}" references an unknown background music cue dialogue.`
        );
      }

      const cueBackgroundMusic = cue.backgroundMusicAssetId
        ? (input.backgroundMusicById.get(cue.backgroundMusicAssetId) ?? null)
        : null;

      if (cue.backgroundMusicAssetId && !cueBackgroundMusic) {
        throw new Error(
          `Scene "${input.scene.title}" references an unknown background music cue asset.`
        );
      }

      return {
        afterDialogueEntryId: cue.afterDialogueEntryId,
        backgroundMusic: cueBackgroundMusic,
        dialogueIndex
      };
    })
    .sort((left, right) => left.dialogueIndex - right.dialogueIndex)
    .map(({ afterDialogueEntryId, backgroundMusic }) => ({
      afterDialogueEntryId,
      backgroundMusic
    }));

  return {
    id: input.scene.id,
    title: input.scene.title,
    orderIndex: input.scene.orderIndex,
    backgroundImage,
    backgroundMusic,
    backgroundMusicCues,
    carryOcnoerDressSelection: input.scene.carryOcnoerDressSelection ?? true,
    characterPool,
    dialogue
  };
}

function buildRuntimeCompileContext(
  snapshot: StoryAuthoringSnapshot
): RuntimeCompileContext {
  const characters = [...snapshot.characters]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(toRuntimeCharacter);
  const backgroundImages = [...snapshot.backgroundImages]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(toRuntimeBackgroundImage);
  const backgroundMusicTracks = [...snapshot.backgroundMusicTracks]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(toRuntimeBackgroundMusic);

  return {
    characters,
    backgroundImages,
    backgroundMusicTracks,
    charactersById: new Map(
      characters.map((character) => [character.id, character])
    ),
    backgroundImagesById: new Map(
      backgroundImages.map((asset) => [asset.id, asset])
    ),
    backgroundMusicById: new Map(
      backgroundMusicTracks.map((asset) => [asset.id, asset])
    ),
    sortedChapters: [...snapshot.chapters].sort(
      (left, right) => left.orderIndex - right.orderIndex
    )
  };
}

function createRuntimeChapterBundle(input: {
  chapter: ChapterDefinition;
  nextChapterId: string | null;
  generatedAt: string;
  bucket: string;
  runtimePrefix: string;
  charactersById: Map<string, RuntimeCharacter>;
  backgroundImagesById: Map<string, RuntimeBackgroundImage>;
  backgroundMusicById: Map<string, RuntimeBackgroundMusic>;
}) {
  const path = `${input.bucket}/${input.runtimePrefix}/chapters/${input.chapter.id}.json`;
  const endingCardBackgroundMusic = input.chapter
    .endingCardBackgroundMusicAssetId
    ? (input.backgroundMusicById.get(
        input.chapter.endingCardBackgroundMusicAssetId
      ) ?? null)
    : null;
  const scenes = [...input.chapter.scenes]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((scene) =>
      compileScene({
        scene,
        charactersById: input.charactersById,
        backgroundImagesById: input.backgroundImagesById,
        backgroundMusicById: input.backgroundMusicById
      })
    );

  if (
    input.chapter.endingCardBackgroundMusicAssetId &&
    !endingCardBackgroundMusic
  ) {
    throw new Error(
      `Chapter "${input.chapter.title}" references an unknown ending card background music track.`
    );
  }

  return {
    chapterId: input.chapter.id,
    path,
    bundle: {
      schemaVersion: STORY_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
      chapter: {
        id: input.chapter.id,
        title: input.chapter.title,
        slug: input.chapter.slug,
        orderIndex: input.chapter.orderIndex,
        openingCardText: input.chapter.openingCardText ?? null,
        endingCardText: input.chapter.endingCardText ?? null,
        endingCardBackgroundMusic,
        scenes
      },
      nextChapterId: input.nextChapterId
    } satisfies RuntimeChapterBundle
  };
}

export function compileRuntimeChapterBundle(input: {
  snapshot: StoryAuthoringSnapshot;
  chapterId: string;
  generatedAt?: string;
  bucket: string;
  runtimePrefix: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const context = buildRuntimeCompileContext(input.snapshot);
  const chapterIndex = context.sortedChapters.findIndex(
    (chapter) => chapter.id === input.chapterId
  );

  if (chapterIndex < 0) {
    throw new Error(`Chapter "${input.chapterId}" was not found.`);
  }

  const chapter = context.sortedChapters[chapterIndex];

  return createRuntimeChapterBundle({
    chapter,
    nextChapterId: context.sortedChapters[chapterIndex + 1]?.id ?? null,
    generatedAt,
    bucket: input.bucket,
    runtimePrefix: input.runtimePrefix,
    charactersById: context.charactersById,
    backgroundImagesById: context.backgroundImagesById,
    backgroundMusicById: context.backgroundMusicById
  });
}

export function compileRuntimeStory(input: {
  snapshot: StoryAuthoringSnapshot;
  generatedAt?: string;
  bucket: string;
  runtimePrefix: string;
}): StoryRuntimeArtifacts {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const context = buildRuntimeCompileContext(input.snapshot);

  const chapterBundles = context.sortedChapters.map((chapter, index) =>
    createRuntimeChapterBundle({
      chapter,
      nextChapterId: context.sortedChapters[index + 1]?.id ?? null,
      generatedAt,
      bucket: input.bucket,
      runtimePrefix: input.runtimePrefix,
      charactersById: context.charactersById,
      backgroundImagesById: context.backgroundImagesById,
      backgroundMusicById: context.backgroundMusicById
    })
  );

  const charactersPath = `${input.bucket}/${input.runtimePrefix}/characters.json`;
  const assetsPath = `${input.bucket}/${input.runtimePrefix}/assets.json`;
  const chaptersPath = `${input.bucket}/${input.runtimePrefix}/manifest.json`;

  const manifest: RuntimeManifest = {
    schemaVersion: STORY_SCHEMA_VERSION,
    generatedAt,
    firstChapterId: context.sortedChapters[0]?.id ?? null,
    chaptersPath,
    charactersPath,
    assetsPath,
    chapters: context.sortedChapters.map((chapter) => ({
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
    characters: context.characters
  };

  const assetsManifest: RuntimeAssetsManifest = {
    schemaVersion: STORY_SCHEMA_VERSION,
    generatedAt,
    backgroundImages: context.backgroundImages,
    backgroundMusicTracks: context.backgroundMusicTracks
  };

  return {
    manifest,
    charactersManifest,
    assetsManifest,
    chapterBundles
  };
}
