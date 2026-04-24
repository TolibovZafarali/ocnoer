import {
  findNextPlayableReaderState,
  getCurrentDialogue,
  getCurrentScene,
  getDressBranchFlagKey,
  getPlayerRuntimeAssetUrls,
  resolveDialogueTextTemplate,
  toPublicStorageUrl,
  type PlayerProgress,
  type ReaderState,
  type RuntimeChapterBundle,
  type RuntimeDialogueEntry,
  type RuntimeStageCharacter
} from "@ocnoer/story-core";

export const SUPPORTED_NATIVE_READER_ENTRY_TYPES = [
  "narrator",
  "character",
  "cat_name_prompt",
  "dress_prompt"
] as const;

export type SupportedNativeReaderEntryType =
  (typeof SUPPORTED_NATIVE_READER_ENTRY_TYPES)[number];

export type NativeReaderPortrait = {
  key: string;
  imageUrl: string;
  label: string;
  side: "left" | "right";
  isActiveSpeaker: boolean;
};

export type NativeReaderDressOption = {
  key: string;
  label: string;
  previewImageUrl: string | null;
};

export type NativeDialogueCardPlacement =
  | "speaker-left"
  | "speaker-right"
  | "center"
  | "cat-name";

type NativeReaderPresentationBase = {
  chapterId: string;
  chapterTitle: string;
  sceneId: string;
  sceneTitle: string;
  sceneIndex: number;
  sceneCount: number;
  dialogueEntryId: string;
  dialogueIndex: number;
  dialogueCount: number;
  backgroundImageUrl: string | null;
  leftPortrait: NativeReaderPortrait | null;
  rightPortrait: NativeReaderPortrait | null;
  stageCharacters: NativeReaderPortrait[];
  dialogueCardPlacement: NativeDialogueCardPlacement;
  preloadImageUrls: string[];
};

export type NativeReaderPresentation =
  | (NativeReaderPresentationBase & {
      status: "supported";
      entryType: SupportedNativeReaderEntryType;
      speakerName: string;
      dialogueText: string;
      dressOptions: NativeReaderDressOption[];
      selectedDressOptionKey: string | null;
      needsCatNameInput: boolean;
      needsDressSelection: boolean;
    })
  | (NativeReaderPresentationBase & {
      status: "unsupported";
      entryType: string;
      message: string;
    });

function getRuntimeSpeakerType(entry: RuntimeDialogueEntry) {
  const speaker = entry.speaker as { type?: unknown };

  return typeof speaker.type === "string" ? speaker.type : "unknown";
}

function isSupportedNativeReaderEntryType(
  entryType: string
): entryType is SupportedNativeReaderEntryType {
  return SUPPORTED_NATIVE_READER_ENTRY_TYPES.some(
    (supportedType) => supportedType === entryType
  );
}

function getSpeakerName(input: {
  entry: RuntimeDialogueEntry;
  catName: string | null;
}) {
  const { entry } = input;

  switch (entry.speaker.type) {
    case "character":
      return resolveDialogueTextTemplate(
        entry.speaker.characterName,
        input.catName
      );
    case "dress_prompt":
      return resolveDialogueTextTemplate(
        entry.speaker.characterName,
        input.catName
      );
    case "cat_name_prompt":
      return input.catName
        ? resolveDialogueTextTemplate(
            entry.speaker.characterName,
            input.catName
          )
        : "Cat Name";
    case "narrator":
      return "Narrator";
    default:
      return "Unknown";
  }
}

function getDialogueCardPlacement(
  entry: RuntimeDialogueEntry
): NativeDialogueCardPlacement {
  if (entry.speaker.type === "cat_name_prompt") {
    return "cat-name";
  }

  if (entry.speaker.type !== "character") {
    return "center";
  }

  if (entry.stage.left?.characterId === entry.speaker.characterId) {
    return "speaker-left";
  }

  if (entry.stage.right?.characterId === entry.speaker.characterId) {
    return "speaker-right";
  }

  return "center";
}

function getDressOptions(input: {
  supabaseUrl: string;
  entry: RuntimeDialogueEntry;
}) {
  if (input.entry.speaker.type !== "dress_prompt") {
    return [];
  }

  return input.entry.speaker.dressOptions.map((option) => ({
    key: option.key,
    label: option.label,
    previewImageUrl: toPublicStorageUrl(
      input.supabaseUrl,
      option.previewImagePath
    )
  }));
}

function getSelectedDressOptionKey(input: {
  entry: RuntimeDialogueEntry;
  branchFlags: PlayerProgress["branchFlags"];
}) {
  if (input.entry.speaker.type !== "dress_prompt") {
    return null;
  }

  const value =
    input.branchFlags[getDressBranchFlagKey(input.entry.speaker.characterId)];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function createNativeReaderPortrait(input: {
  catName: string | null;
  imageUrl: string;
  placement: NativeReaderPortrait["side"];
  stageCharacter: RuntimeStageCharacter | null;
  fallbackCharacter: {
    characterId: string;
    characterName: string;
    characterSlug: string;
    emotionKey: string;
  };
  isActiveSpeaker: boolean;
}): NativeReaderPortrait {
  return {
    key: `${input.placement}:${input.fallbackCharacter.characterId}:${input.fallbackCharacter.emotionKey}:${input.imageUrl}`,
    imageUrl: input.imageUrl,
    label: resolveDialogueTextTemplate(
      input.stageCharacter?.characterName ??
        input.fallbackCharacter.characterName,
      input.catName
    ),
    side: input.placement,
    isActiveSpeaker: input.isActiveSpeaker
  };
}

function getPromptFallbackCharacter(entry: RuntimeDialogueEntry) {
  if (
    entry.speaker.type === "character" ||
    entry.speaker.type === "dress_prompt" ||
    entry.speaker.type === "cat_name_prompt"
  ) {
    return {
      characterId: entry.speaker.characterId,
      characterName: entry.speaker.characterName,
      characterSlug: entry.speaker.characterSlug,
      emotionKey:
        entry.speaker.type === "character"
          ? entry.speaker.emotionKey
          : "default"
    };
  }

  return null;
}

function createVisibleNativePortraits(input: {
  entry: RuntimeDialogueEntry;
  assetUrls: ReturnType<typeof getPlayerRuntimeAssetUrls>;
  catName: string | null;
}) {
  const fallbackCharacter = getPromptFallbackCharacter(input.entry);

  if (!fallbackCharacter) {
    return {
      leftPortrait: null,
      rightPortrait: null
    };
  }

  const leftPortrait =
    input.assetUrls.leftCharacterImageUrl && input.entry.stage.left
      ? createNativeReaderPortrait({
          catName: input.catName,
          imageUrl: input.assetUrls.leftCharacterImageUrl,
          placement: "left",
          stageCharacter: input.entry.stage.left,
          fallbackCharacter,
          isActiveSpeaker:
            input.entry.stage.left.characterId === fallbackCharacter.characterId
        })
      : null;

  const rightStageCharacter =
    input.entry.speaker.type === "cat_name_prompt"
      ? input.entry.stage.right?.characterId === fallbackCharacter.characterId
        ? input.entry.stage.right
        : input.entry.stage.left?.characterId === fallbackCharacter.characterId
          ? input.entry.stage.left
          : null
      : input.entry.stage.right;

  const rightPortrait = input.assetUrls.rightCharacterImageUrl
    ? createNativeReaderPortrait({
        catName: input.catName,
        imageUrl: input.assetUrls.rightCharacterImageUrl,
        placement: "right",
        stageCharacter: rightStageCharacter,
        fallbackCharacter,
        isActiveSpeaker:
          input.entry.speaker.type === "cat_name_prompt" ||
          rightStageCharacter?.characterId === fallbackCharacter.characterId
      })
    : null;

  return {
    leftPortrait,
    rightPortrait
  };
}

function uniqueImageUrls(imageUrls: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      imageUrls.filter(
        (imageUrl): imageUrl is string =>
          typeof imageUrl === "string" && imageUrl.length > 0
      )
    )
  );
}

function getNextBackgroundImageUrl(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle;
  readerState: ReaderState;
  branchFlags: PlayerProgress["branchFlags"];
}) {
  const nextState = findNextPlayableReaderState(
    input.bundle.chapter,
    input.readerState
  );

  if (!nextState) {
    return null;
  }

  return getPlayerRuntimeAssetUrls({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: nextState.state,
    branchFlags: input.branchFlags
  }).backgroundImageUrl;
}

export function createNativeReaderPresentation(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle;
  readerState: ReaderState;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}): NativeReaderPresentation | null {
  const scene = getCurrentScene(input.bundle.chapter, input.readerState);
  const entry = getCurrentDialogue(input.bundle.chapter, input.readerState);

  if (!scene || !entry) {
    return null;
  }

  const assetUrls = getPlayerRuntimeAssetUrls({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: input.branchFlags
  });
  const entryType = getRuntimeSpeakerType(entry);
  const speakerName = isSupportedNativeReaderEntryType(entryType)
    ? getSpeakerName({
        entry,
        catName: input.catName
      })
    : "Unsupported";
  const { leftPortrait, rightPortrait } = createVisibleNativePortraits({
    entry,
    assetUrls,
    catName: input.catName
  });
  const stageCharacters = [leftPortrait, rightPortrait].filter(
    (portrait): portrait is NativeReaderPortrait => Boolean(portrait)
  );
  const nextBackgroundImageUrl = getNextBackgroundImageUrl({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: input.branchFlags
  });
  const dressOptions = getDressOptions({
    supabaseUrl: input.supabaseUrl,
    entry
  });
  const preloadImageUrls = uniqueImageUrls([
    assetUrls.backgroundImageUrl,
    nextBackgroundImageUrl,
    ...stageCharacters.map((portrait) => portrait.imageUrl),
    ...dressOptions.map((option) => option.previewImageUrl)
  ]);
  const base = {
    chapterId: input.bundle.chapter.id,
    chapterTitle: input.bundle.chapter.title,
    sceneId: scene.id,
    sceneTitle: scene.title,
    sceneIndex: input.readerState.sceneIndex,
    sceneCount: input.bundle.chapter.scenes.length,
    dialogueEntryId: entry.id,
    dialogueIndex: input.readerState.dialogueIndex,
    dialogueCount: scene.dialogue.length,
    backgroundImageUrl: assetUrls.backgroundImageUrl,
    leftPortrait,
    rightPortrait,
    stageCharacters,
    dialogueCardPlacement: getDialogueCardPlacement(entry),
    preloadImageUrls
  } satisfies NativeReaderPresentationBase;
  if (!isSupportedNativeReaderEntryType(entryType)) {
    return {
      ...base,
      status: "unsupported",
      entryType,
      message: `Unsupported dialogue entry type: ${entryType}`
    };
  }

  const selectedDressOptionKey = getSelectedDressOptionKey({
    entry,
    branchFlags: input.branchFlags
  });

  return {
    ...base,
    status: "supported",
    entryType,
    speakerName,
    dialogueText: resolveDialogueTextTemplate(entry.text, input.catName),
    dressOptions,
    selectedDressOptionKey,
    needsCatNameInput: entryType === "cat_name_prompt" && input.catName == null,
    needsDressSelection:
      entryType === "dress_prompt" && selectedDressOptionKey == null
  };
}
