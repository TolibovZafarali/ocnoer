export const STORY_SCHEMA_VERSION = 1;

export const MEDIA_ASSET_TYPES = [
  "background_image",
  "background_music"
] as const;

export const DIALOGUE_SPEAKER_TYPES = [
  "narrator",
  "character",
  "dress_prompt"
] as const;

export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];
export type DialogueSpeakerType = (typeof DIALOGUE_SPEAKER_TYPES)[number];

export type CharacterEmotion = {
  id: string;
  key: string;
  label: string;
  imagePath: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterDressEmotionOverride = {
  id: string;
  emotionKey: string;
  imagePath: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterDress = {
  id: string;
  key: string;
  label: string;
  emotionOverrides: CharacterDressEmotionOverride[];
  createdAt: string;
  updatedAt: string;
};

export type CharacterDefinition = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  defaultEmotionKey: string;
  emotions: CharacterEmotion[];
  dresses: CharacterDress[];
  createdAt: string;
  updatedAt: string;
};

export type BackgroundImageAsset = {
  id: string;
  type: "background_image";
  label: string;
  slug: string;
  altText: string | null;
  filePath: string;
  createdAt: string;
  updatedAt: string;
};

export type BackgroundMusicTrack = {
  id: string;
  type: "background_music";
  label: string;
  slug: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryAsset = BackgroundImageAsset | BackgroundMusicTrack;

export type DialogueSpeaker =
  | {
      type: "narrator";
    }
  | {
      type: "character";
      characterId: string;
      emotionKey: string;
    }
  | {
      type: "dress_prompt";
      characterId: string;
      dressOptionKeys: string[];
    };

export type DialogueEntryBase = {
  id: string;
  orderIndex: number;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type DialogueEntry = DialogueEntryBase & {
  speaker: DialogueSpeaker;
};

export type SceneDefinition = {
  id: string;
  title: string;
  orderIndex: number;
  backgroundImageAssetId: string;
  backgroundMusicAssetId: string | null;
  carryOcnoerDressSelection: boolean;
  characterIds: string[];
  dialogue: DialogueEntry[];
  createdAt: string;
  updatedAt: string;
};

export type ChapterDefinition = {
  id: string;
  title: string;
  slug: string;
  orderIndex: number;
  scenes: SceneDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type StoryAuthoringSnapshot = {
  characters: CharacterDefinition[];
  backgroundImages: BackgroundImageAsset[];
  backgroundMusicTracks: BackgroundMusicTrack[];
  chapters: ChapterDefinition[];
};

export type SceneDraftDialogueEntry = {
  id: string;
  speakerType: DialogueSpeakerType;
  characterId: string | null;
  emotionKey: string | null;
  dressOptionKeys?: string[];
  text: string;
};

export type SceneDraftPayload = {
  scene: {
    title: string;
    orderIndex: number;
    backgroundImageAssetId: string;
    backgroundMusicAssetId: string | null;
    carryOcnoerDressSelection: boolean;
    characterIds: string[];
  };
  dialogue: SceneDraftDialogueEntry[];
};

export type CharactersCatalogFile = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  updatedAt: string;
  characters: CharacterDefinition[];
};

export type AssetsCatalogFile = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  updatedAt: string;
  backgroundImages: BackgroundImageAsset[];
  backgroundMusicTracks: BackgroundMusicTrack[];
};

export type ChaptersCatalogFile = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  updatedAt: string;
  chapters: ChapterDefinition[];
};

export type RuntimeCharacterEmotion = {
  key: string;
  label: string;
  imagePath: string;
};

export type RuntimeCharacterDressEmotionOverride = {
  emotionKey: string;
  imagePath: string;
};

export type RuntimeCharacterDress = {
  key: string;
  label: string;
  emotionOverrides: RuntimeCharacterDressEmotionOverride[];
};

export type RuntimeCharacter = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  defaultEmotionKey: string;
  defaultEmotionImagePath: string;
  emotions: RuntimeCharacterEmotion[];
  dresses: RuntimeCharacterDress[];
};

export type RuntimeBackgroundImage = {
  id: string;
  label: string;
  slug: string;
  altText: string | null;
  filePath: string;
};

export type RuntimeBackgroundMusic = {
  id: string;
  label: string;
  slug: string;
  filePath: string;
};

export type RuntimeStageCharacter = {
  characterId: string;
  characterName: string;
  characterSlug: string;
  emotionKey: string;
  emotionLabel: string;
  imagePath: string;
};

export type RuntimeDressPromptOption = {
  key: string;
  label: string;
  previewImagePath: string | null;
};

export type RuntimeDialogueSpeaker =
  | {
      type: "narrator";
    }
  | {
      type: "character";
      characterId: string;
      characterName: string;
      characterSlug: string;
      emotionKey: string;
      emotionLabel: string;
      emotionImagePath: string;
    }
  | {
      type: "dress_prompt";
      characterId: string;
      characterName: string;
      characterSlug: string;
      dressOptions: RuntimeDressPromptOption[];
    };

export type RuntimeDialogueEntry = {
  id: string;
  orderIndex: number;
  text: string;
  speaker: RuntimeDialogueSpeaker;
  stage: {
    left: RuntimeStageCharacter | null;
    right: RuntimeStageCharacter | null;
  };
};

export type RuntimeScene = {
  id: string;
  title: string;
  orderIndex: number;
  backgroundImage: RuntimeBackgroundImage;
  backgroundMusic: RuntimeBackgroundMusic | null;
  carryOcnoerDressSelection: boolean;
  characterPool: RuntimeCharacter[];
  dialogue: RuntimeDialogueEntry[];
};

export type RuntimeChapterBundle = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  generatedAt: string;
  chapter: {
    id: string;
    title: string;
    slug: string;
    orderIndex: number;
    scenes: RuntimeScene[];
  };
  nextChapterId: string | null;
};

export type RuntimeManifestChapter = {
  id: string;
  title: string;
  slug: string;
  orderIndex: number;
  bundlePath: string;
};

export type RuntimeManifest = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  generatedAt: string;
  firstChapterId: string | null;
  chaptersPath: string;
  charactersPath: string;
  assetsPath: string;
  chapters: RuntimeManifestChapter[];
};

export type RuntimeCharactersManifest = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  generatedAt: string;
  characters: RuntimeCharacter[];
};

export type RuntimeAssetsManifest = {
  schemaVersion: typeof STORY_SCHEMA_VERSION;
  generatedAt: string;
  backgroundImages: RuntimeBackgroundImage[];
  backgroundMusicTracks: RuntimeBackgroundMusic[];
};

export type StoryRuntimeArtifacts = {
  manifest: RuntimeManifest;
  charactersManifest: RuntimeCharactersManifest;
  assetsManifest: RuntimeAssetsManifest;
  chapterBundles: Array<{
    chapterId: string;
    path: string;
    bundle: RuntimeChapterBundle;
  }>;
};
