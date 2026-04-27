import {
  findNextPlayableReaderState,
  getCurrentDialogue,
  getCurrentScene,
  getDressBranchFlagKey,
  getPlayerRuntimeAssetUrls,
  getPlayerRuntimeSceneAssetRefs,
  getPlayerRuntimeSceneAssetUrls,
  getPlayerRuntimeStageCharacters,
  resolveRuntimeSceneBranchFlags,
  resolveDialogueTextTemplate,
  toPublicStorageUrl,
  type PlayerProgress,
  type PlayerRuntimeImageAssetRef,
  type PlayerRuntimeStageCharacter,
  type ReaderState,
  type RuntimeChapterBundle,
  type RuntimeCharacter,
  type RuntimeDialogueEntry,
  type RuntimeImageDerivative,
  type RuntimeScene
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

export type NativeReaderAssetRef = PlayerRuntimeImageAssetRef;

export type NativeReaderPortraitSceneReference = {
  chapterId: string;
  chapterTitle: string;
  sceneId: string;
  sceneTitle: string;
  dialogueEntryId?: string | null;
  dialogueIndex?: number | null;
};

export type NativeReaderPortraitAuditEntry = {
  assetRef: NativeReaderAssetRef;
  characterId: string;
  characterName: string;
  emotionKey: string | null;
  dressKey: string | null;
  variantKey: string | null;
  sceneReferences: NativeReaderPortraitSceneReference[];
};

export type NativeDialogueCardPlacement =
  | "speaker-left"
  | "speaker-right"
  | "center";

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
  speakerId: string | null;
  speakerStatus: string;
  blockingPreloadImageUrls: string[];
  preloadImageUrls: string[];
  blockingAssetRefs: NativeReaderAssetRef[];
  preloadAssetRefs: NativeReaderAssetRef[];
  effectiveBranchFlags: PlayerProgress["branchFlags"];
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
    return "speaker-right";
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

function getSpeakerReadinessIdentity(entry: RuntimeDialogueEntry) {
  switch (entry.speaker.type) {
    case "character":
      return {
        speakerId: entry.speaker.characterId,
        speakerStatus: `${entry.speaker.type}:${entry.speaker.characterId}:${entry.speaker.emotionKey}`
      };
    case "dress_prompt":
      return {
        speakerId: entry.speaker.characterId,
        speakerStatus: `${entry.speaker.type}:${entry.speaker.characterId}:${entry.speaker.dressOptions
          .map((option) => `${option.key}:${option.previewImagePath ?? ""}`)
          .join("|")}`
      };
    case "cat_name_prompt":
      return {
        speakerId: entry.speaker.characterId,
        speakerStatus: `${entry.speaker.type}:${entry.speaker.characterId}`
      };
    case "narrator":
      return {
        speakerId: null,
        speakerStatus: "narrator"
      };
  }
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
  character: {
    characterId: string;
    characterName: string;
    characterSlug: string;
    emotionKey: string;
  };
  isActiveSpeaker: boolean;
}): NativeReaderPortrait {
  return {
    key: `${input.placement}:${input.imageUrl}`,
    imageUrl: input.imageUrl,
    label: resolveDialogueTextTemplate(
      input.character.characterName,
      input.catName
    ),
    side: input.placement,
    isActiveSpeaker: input.isActiveSpeaker
  };
}

function getNativeReaderPortraitImageIdentity(
  portrait: NativeReaderPortrait | null
) {
  return portrait ? `${portrait.side}:${portrait.imageUrl}` : null;
}

function shouldKeepNativeReaderPortraitMountedForTransition(input: {
  current: NativeReaderPortrait | null;
  next: NativeReaderPortrait | null;
}) {
  const currentIdentity = getNativeReaderPortraitImageIdentity(input.current);
  const nextIdentity = getNativeReaderPortraitImageIdentity(input.next);

  return Boolean(currentIdentity) && currentIdentity === nextIdentity;
}

export function getNativeReaderPortraitTransitionContinuity(input: {
  current: {
    leftPortrait: NativeReaderPortrait | null;
    rightPortrait: NativeReaderPortrait | null;
  };
  next: {
    leftPortrait: NativeReaderPortrait | null;
    rightPortrait: NativeReaderPortrait | null;
  } | null;
}) {
  if (!input.next) {
    return {
      left: false,
      right: false
    };
  }

  return {
    left: shouldKeepNativeReaderPortraitMountedForTransition({
      current: input.current.leftPortrait,
      next: input.next.leftPortrait
    }),
    right: shouldKeepNativeReaderPortraitMountedForTransition({
      current: input.current.rightPortrait,
      next: input.next.rightPortrait
    })
  };
}

export function shouldKeepNativeReaderPortraitsMountedForTransition(input: {
  current: {
    leftPortrait: NativeReaderPortrait | null;
    rightPortrait: NativeReaderPortrait | null;
  };
  next: {
    leftPortrait: NativeReaderPortrait | null;
    rightPortrait: NativeReaderPortrait | null;
  } | null;
}) {
  if (!input.next) {
    return false;
  }

  const currentLeftIdentity = getNativeReaderPortraitImageIdentity(
    input.current.leftPortrait
  );
  const currentRightIdentity = getNativeReaderPortraitImageIdentity(
    input.current.rightPortrait
  );
  const nextLeftIdentity = getNativeReaderPortraitImageIdentity(
    input.next.leftPortrait
  );
  const nextRightIdentity = getNativeReaderPortraitImageIdentity(
    input.next.rightPortrait
  );

  return (
    Boolean(currentLeftIdentity || currentRightIdentity) &&
    currentLeftIdentity === nextLeftIdentity &&
    currentRightIdentity === nextRightIdentity
  );
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
  runtimeStageCharacters: PlayerRuntimeStageCharacter[];
  catName: string | null;
}) {
  if (input.entry.speaker.type === "cat_name_prompt") {
    const activePromptStageCharacter =
      input.runtimeStageCharacters.find(
        (stageCharacter) => stageCharacter.isActiveSpeaker
      ) ?? null;
    const promptFallbackCharacter = getPromptFallbackCharacter(input.entry);
    const promptCharacter =
      activePromptStageCharacter ?? promptFallbackCharacter;
    const promptImageUrl =
      activePromptStageCharacter?.imageUrl ??
      input.assetUrls.rightCharacterImageUrl;
    const rightPortrait =
      promptImageUrl && promptCharacter
        ? createNativeReaderPortrait({
            catName: input.catName,
            imageUrl: promptImageUrl,
            placement: "right",
            character: promptCharacter,
            isActiveSpeaker: true
          })
        : null;

    return {
      leftPortrait: null,
      rightPortrait,
      stageCharacters: rightPortrait ? [rightPortrait] : []
    };
  }

  const stagePortraits = input.runtimeStageCharacters
    .filter((stageCharacter) => stageCharacter.isActiveSpeaker)
    .map((stageCharacter) =>
      createNativeReaderPortrait({
        catName: input.catName,
        imageUrl: stageCharacter.imageUrl,
        placement: stageCharacter.placement,
        character: stageCharacter,
        isActiveSpeaker: stageCharacter.isActiveSpeaker
      })
    );
  const leftPortrait =
    stagePortraits.find((portrait) => portrait.side === "left") ?? null;
  const rightPortrait =
    stagePortraits.find((portrait) => portrait.side === "right") ?? null;
  const portraits = [leftPortrait, rightPortrait].filter(
    (portrait): portrait is NativeReaderPortrait => Boolean(portrait)
  );

  return {
    leftPortrait,
    rightPortrait,
    stageCharacters: portraits
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

function findAssetRefsByUrls(input: {
  assetRefs: NativeReaderAssetRef[];
  imageUrls: string[];
}) {
  const assetRefsByUrl = new Map(
    input.assetRefs.map((assetRef) => [assetRef.url, assetRef])
  );

  return input.imageUrls.map(
    (imageUrl): NativeReaderAssetRef =>
      assetRefsByUrl.get(imageUrl) ?? {
        role: "portrait",
        url: imageUrl,
        storagePath: imageUrl,
        cacheKey: imageUrl,
        assetId: null
      }
  );
}

function getPathExtension(value: string | null | undefined) {
  const path = value?.split(/[?#]/)[0] ?? "";
  const fileName = path.split("/").pop() ?? "";
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

  return match?.[1]?.toLowerCase() ?? null;
}

function isAlphaSafeDerivative(derivative: RuntimeImageDerivative) {
  const contentType = derivative.contentType.toLowerCase();

  return (
    derivative.renderKind === "bitmap" &&
    (derivative.targetPlatform == null ||
      derivative.targetPlatform === "ios") &&
    (contentType.includes("image/png") || contentType.includes("image/webp"))
  );
}

function toPublicStorageDerivative(input: {
  supabaseUrl: string;
  derivative: RuntimeImageDerivative;
}) {
  const url = toPublicStorageUrl(
    input.supabaseUrl,
    input.derivative.storagePath
  );

  if (!url) {
    return null;
  }

  return {
    ...input.derivative,
    url,
    cacheKey: input.derivative.hash
      ? `derivative:${input.derivative.hash}:${input.derivative.storagePath}`
      : `derivative:${input.derivative.storagePath}`
  };
}

function toPublicStorageDerivatives(input: {
  supabaseUrl: string;
  derivatives?: RuntimeImageDerivative[];
}) {
  return (
    input.derivatives
      ?.map((derivative) =>
        toPublicStorageDerivative({
          supabaseUrl: input.supabaseUrl,
          derivative
        })
      )
      .filter((derivative): derivative is NonNullable<typeof derivative> =>
        Boolean(derivative)
      ) ?? []
  );
}

function getSourceRenderKind(input: {
  storagePath: string;
  derivatives?: RuntimeImageDerivative[];
}) {
  const derivativeSourceKind = input.derivatives?.find(
    (derivative) => derivative.sourceRenderKind
  )?.sourceRenderKind;

  if (derivativeSourceKind) {
    return derivativeSourceKind;
  }

  const extension = getPathExtension(input.storagePath);

  if (extension === "svg") {
    return "svg";
  }

  if (
    extension === "png" ||
    extension === "webp" ||
    extension === "jpg" ||
    extension === "jpeg"
  ) {
    return "bitmap";
  }

  return "unknown";
}

function createPortraitAuditAssetRef(input: {
  supabaseUrl: string;
  characterId: string;
  emotionKey: string | null;
  dressKey: string | null;
  storagePath: string;
  derivatives?: RuntimeImageDerivative[];
}) {
  const url = toPublicStorageUrl(input.supabaseUrl, input.storagePath);

  if (!url) {
    return null;
  }

  const publicDerivatives = toPublicStorageDerivatives({
    supabaseUrl: input.supabaseUrl,
    derivatives: input.derivatives
  });
  const iosDerivative =
    publicDerivatives.find((derivative) => isAlphaSafeDerivative(derivative)) ??
    null;
  const sourceRenderKind = getSourceRenderKind({
    storagePath: input.storagePath,
    derivatives: input.derivatives
  });
  const assetRef: NativeReaderAssetRef = {
    role: "portrait",
    url,
    storagePath: input.storagePath,
    assetId: input.characterId,
    cacheKey: `portrait:${input.characterId}:${input.emotionKey ?? "unknown"}:${input.dressKey ?? "__base__"}:${input.storagePath}`,
    derivatives: publicDerivatives.length > 0 ? publicDerivatives : undefined,
    ...(sourceRenderKind !== "bitmap"
      ? {
          sourceRenderKind
        }
      : {}),
    ...(sourceRenderKind === "svg"
      ? {
          originalSvgStoragePath: input.storagePath,
          originalSvgUrl: url
        }
      : {}),
    ...(iosDerivative
      ? {
          iosDerivativeStoragePath: iosDerivative.storagePath,
          iosDerivativeUrl: iosDerivative.url,
          iosDerivativeContentType: iosDerivative.contentType,
          iosDerivativeWidth: iosDerivative.width ?? null,
          iosDerivativeHeight: iosDerivative.height ?? null,
          iosDerivativeHash: iosDerivative.hash ?? null,
          iosRenderKind: "bitmap" as const
        }
      : {})
  };

  return assetRef;
}

function addPortraitAuditEntry(input: {
  entriesByKey: Map<string, NativeReaderPortraitAuditEntry>;
  supabaseUrl: string;
  chapterId: string;
  chapterTitle: string;
  scene: RuntimeScene;
  character: Pick<RuntimeCharacter, "id" | "name">;
  emotionKey: string | null;
  dressKey: string | null;
  variantKey: string | null;
  storagePath: string | null | undefined;
  derivatives?: RuntimeImageDerivative[];
  dialogueEntryId?: string | null;
  dialogueIndex?: number | null;
}) {
  if (!input.storagePath) {
    return;
  }

  const assetRef = createPortraitAuditAssetRef({
    supabaseUrl: input.supabaseUrl,
    characterId: input.character.id,
    emotionKey: input.emotionKey,
    dressKey: input.dressKey,
    storagePath: input.storagePath,
    derivatives: input.derivatives
  });

  if (!assetRef) {
    return;
  }

  const key = `${input.character.id}:${input.emotionKey ?? ""}:${input.dressKey ?? ""}:${input.storagePath}`;
  const sceneReference: NativeReaderPortraitSceneReference = {
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    sceneId: input.scene.id,
    sceneTitle: input.scene.title,
    dialogueEntryId: input.dialogueEntryId ?? null,
    dialogueIndex: input.dialogueIndex ?? null
  };
  const existing = input.entriesByKey.get(key);

  if (existing) {
    const sceneReferenceKey = `${sceneReference.sceneId}:${sceneReference.dialogueEntryId ?? ""}:${sceneReference.dialogueIndex ?? ""}`;

    if (
      !existing.sceneReferences.some(
        (reference) =>
          `${reference.sceneId}:${reference.dialogueEntryId ?? ""}:${reference.dialogueIndex ?? ""}` ===
          sceneReferenceKey
      )
    ) {
      existing.sceneReferences.push(sceneReference);
    }

    return;
  }

  input.entriesByKey.set(key, {
    assetRef,
    characterId: input.character.id,
    characterName: input.character.name,
    emotionKey: input.emotionKey,
    dressKey: input.dressKey,
    variantKey: input.variantKey,
    sceneReferences: [sceneReference]
  });
}

export function getNativeReaderChapterPortraitAuditEntries(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
}) {
  if (!input.bundle) {
    return [];
  }

  const entriesByKey = new Map<string, NativeReaderPortraitAuditEntry>();
  const chapter = input.bundle.chapter;

  chapter.scenes.forEach((scene) => {
    scene.characterPool.forEach((character) => {
      character.emotions.forEach((emotion) => {
        addPortraitAuditEntry({
          entriesByKey,
          supabaseUrl: input.supabaseUrl,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          scene,
          character,
          emotionKey: emotion.key,
          dressKey: null,
          variantKey: "base",
          storagePath: emotion.imagePath,
          derivatives: emotion.imageDerivatives
        });
      });

      character.dresses.forEach((dress) => {
        dress.emotionOverrides.forEach((override) => {
          addPortraitAuditEntry({
            entriesByKey,
            supabaseUrl: input.supabaseUrl,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            scene,
            character,
            emotionKey: override.emotionKey,
            dressKey: dress.key,
            variantKey: `${dress.key}:${override.emotionKey}`,
            storagePath: override.imagePath,
            derivatives: override.imageDerivatives
          });
        });
      });
    });

    scene.dialogue.forEach((dialogueEntry, dialogueIndex) => {
      const addStageCharacter = (
        stageCharacter: RuntimeDialogueEntry["stage"]["left"]
      ) => {
        if (!stageCharacter) {
          return;
        }

        addPortraitAuditEntry({
          entriesByKey,
          supabaseUrl: input.supabaseUrl,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          scene,
          character: {
            id: stageCharacter.characterId,
            name: stageCharacter.characterName
          },
          emotionKey: stageCharacter.emotionKey,
          dressKey: null,
          variantKey: "stage",
          storagePath: stageCharacter.imagePath,
          derivatives: stageCharacter.imageDerivatives,
          dialogueEntryId: dialogueEntry.id,
          dialogueIndex
        });
      };

      addStageCharacter(dialogueEntry.stage.left);
      addStageCharacter(dialogueEntry.stage.right);
    });
  });

  return Array.from(entriesByKey.values());
}

function getNextSceneAssetRefs(input: {
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
    return [];
  }

  return getPlayerRuntimeSceneAssetRefs({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: nextState.state,
    branchFlags: input.branchFlags
  });
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

  const effectiveBranchFlags = resolveRuntimeSceneBranchFlags({
    scene,
    branchFlags: input.branchFlags
  });
  const assetUrls = getPlayerRuntimeAssetUrls({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: effectiveBranchFlags
  });
  const entryType = getRuntimeSpeakerType(entry);
  const speakerIdentity = getSpeakerReadinessIdentity(entry);
  const speakerName = isSupportedNativeReaderEntryType(entryType)
    ? getSpeakerName({
        entry,
        catName: input.catName
      })
    : "Unsupported";
  const { leftPortrait, rightPortrait, stageCharacters } =
    createVisibleNativePortraits({
      entry,
      assetUrls,
      runtimeStageCharacters: getPlayerRuntimeStageCharacters({
        supabaseUrl: input.supabaseUrl,
        bundle: input.bundle,
        readerState: input.readerState,
        branchFlags: effectiveBranchFlags
      }),
      catName: input.catName
    });
  const nextSceneAssetRefs = getNextSceneAssetRefs({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: effectiveBranchFlags
  });
  const dressOptions = getDressOptions({
    supabaseUrl: input.supabaseUrl,
    entry
  });
  const sceneAssetRefs = getPlayerRuntimeSceneAssetRefs({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: effectiveBranchFlags
  });
  const sceneAssetUrls = getPlayerRuntimeSceneAssetUrls({
    supabaseUrl: input.supabaseUrl,
    bundle: input.bundle,
    readerState: input.readerState,
    branchFlags: effectiveBranchFlags
  });
  const blockingPreloadImageUrls = uniqueImageUrls([
    assetUrls.backgroundImageUrl,
    ...stageCharacters.map((portrait) => portrait.imageUrl),
    ...dressOptions.map((option) => option.previewImageUrl)
  ]);
  const blockingAssetRefs = findAssetRefsByUrls({
    assetRefs: sceneAssetRefs,
    imageUrls: blockingPreloadImageUrls
  });
  const preloadAssetRefs = Array.from(
    new Map(
      [...sceneAssetRefs, ...nextSceneAssetRefs].map((assetRef) => [
        assetRef.url,
        assetRef
      ])
    ).values()
  );
  const preloadImageUrls = uniqueImageUrls([
    ...sceneAssetUrls,
    ...nextSceneAssetRefs.map((assetRef) => assetRef.url),
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
    speakerId: speakerIdentity.speakerId,
    speakerStatus: speakerIdentity.speakerStatus,
    blockingPreloadImageUrls,
    preloadImageUrls,
    blockingAssetRefs,
    preloadAssetRefs,
    effectiveBranchFlags
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
    branchFlags: effectiveBranchFlags
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
