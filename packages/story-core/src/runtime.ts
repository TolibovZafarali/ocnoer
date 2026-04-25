import {
  createReaderStateFromProgress,
  getCurrentDialogue,
  getCurrentScene,
  getManifestChapterById,
  resolvePlayableRuntimePosition,
  type PlayerProgress,
  type ReaderState,
  type RuntimeChapterLoader
} from "./reader";
import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene,
  RuntimeStageCharacter
} from "./types";
import {
  applySceneDressCarrySelection,
  getSelectedDressKey,
  resolveDressImagePath
} from "./wardrobe";

export type PlayerRuntimeAssetUrls = {
  backgroundImageUrl: string | null;
  leftCharacterImageUrl: string | null;
  rightCharacterImageUrl: string | null;
};

export type PlayerRuntimeStagePlacement = "left" | "right";

export type PlayerRuntimeStageCharacter = {
  placement: PlayerRuntimeStagePlacement;
  characterId: string;
  characterName: string;
  characterSlug: string;
  emotionKey: string;
  emotionLabel: string;
  imageUrl: string;
  isActiveSpeaker: boolean;
};

export type PlayerRuntimeImageAssetRole =
  | "background"
  | "portrait"
  | "dress-preview";

export type PlayerRuntimeImageAssetRef = {
  role: PlayerRuntimeImageAssetRole;
  url: string;
  storagePath: string;
  cacheKey: string;
  assetId?: string | null;
};

export type RuntimeFetchInit = {
  cache?: "no-store";
};

export type RuntimeFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type RuntimeJsonFetcher = (
  url: string,
  init?: RuntimeFetchInit
) => Promise<RuntimeFetchResponse>;

export type PlayerRuntimeBootstrap = {
  initialManifest: RuntimeManifest;
  initialBundle: RuntimeChapterBundle | null;
  initialReaderState: ReaderState | null;
  initialAssetUrls: PlayerRuntimeAssetUrls;
};

export type PlayerRuntimeSession = {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
};

export type PlayerResumeAction =
  | {
      type: "use-initial-state";
      branchFlags: PlayerProgress["branchFlags"];
    }
  | {
      type: "resume-from-initial-bundle";
      branchFlags: PlayerProgress["branchFlags"];
      readerState: ReaderState;
    }
  | {
      type: "load-from-progress";
      branchFlags: PlayerProgress["branchFlags"];
    };

function createEmptyPlayerRuntimeAssetUrls(): PlayerRuntimeAssetUrls {
  return {
    backgroundImageUrl: null,
    leftCharacterImageUrl: null,
    rightCharacterImageUrl: null
  };
}

function resolveStageCharacterImagePath(input: {
  scene: RuntimeScene;
  stageCharacter: RuntimeStageCharacter | null;
  branchFlags: PlayerProgress["branchFlags"];
}) {
  if (!input.stageCharacter) {
    return null;
  }

  const character =
    input.scene.characterPool.find(
      (candidate) => candidate.id === input.stageCharacter?.characterId
    ) ?? null;

  if (!character) {
    return input.stageCharacter.imagePath;
  }

  return (
    resolveDressImagePath({
      character,
      emotionKey: input.stageCharacter.emotionKey,
      dressKey: getSelectedDressKey(input.branchFlags, character.id)
    }) ?? input.stageCharacter.imagePath
  );
}

function resolveSceneCharacterImagePath(input: {
  scene: RuntimeScene;
  characterId: string;
  branchFlags: PlayerProgress["branchFlags"];
}) {
  const character =
    input.scene.characterPool.find(
      (candidate) => candidate.id === input.characterId
    ) ?? null;

  if (!character) {
    return null;
  }

  return (
    resolveDressImagePath({
      character,
      emotionKey: character.defaultEmotionKey,
      dressKey: getSelectedDressKey(input.branchFlags, character.id)
    }) ?? character.defaultEmotionImagePath
  );
}

function getVisiblePlayerStageImagePaths(input: {
  scene: RuntimeScene;
  entry: RuntimeDialogueEntry;
  branchFlags: PlayerProgress["branchFlags"];
}) {
  const { entry } = input;

  if (entry.speaker.type === "cat_name_prompt") {
    const speakerCharacterId = entry.speaker.characterId;
    const stageSpeakerRight =
      entry.stage.right?.characterId === speakerCharacterId
        ? entry.stage.right
        : null;
    const stageSpeakerLeft =
      entry.stage.left?.characterId === speakerCharacterId
        ? entry.stage.left
        : null;
    const rightImagePath = stageSpeakerRight
      ? resolveStageCharacterImagePath({
          scene: input.scene,
          stageCharacter: stageSpeakerRight,
          branchFlags: input.branchFlags
        })
      : stageSpeakerLeft
        ? resolveStageCharacterImagePath({
            scene: input.scene,
            stageCharacter: stageSpeakerLeft,
            branchFlags: input.branchFlags
          })
        : resolveSceneCharacterImagePath({
            scene: input.scene,
            characterId: speakerCharacterId,
            branchFlags: input.branchFlags
          });

    return {
      leftImagePath: null,
      rightImagePath
    };
  }

  const speakerCharacterId =
    entry.speaker.type === "character" ? entry.speaker.characterId : null;

  if (!speakerCharacterId) {
    return {
      leftImagePath: null,
      rightImagePath: null
    };
  }

  return {
    leftImagePath:
      entry.stage.left?.characterId === speakerCharacterId
        ? resolveStageCharacterImagePath({
            scene: input.scene,
            stageCharacter: entry.stage.left,
            branchFlags: input.branchFlags
          })
        : null,
    rightImagePath:
      entry.stage.right?.characterId === speakerCharacterId
        ? resolveStageCharacterImagePath({
            scene: input.scene,
            stageCharacter: entry.stage.right,
            branchFlags: input.branchFlags
          })
        : null
  };
}

export function resolveRuntimeSceneBranchFlags(input: {
  scene: RuntimeScene | null;
  branchFlags?: PlayerProgress["branchFlags"];
}) {
  return applySceneDressCarrySelection({
    scene: input.scene,
    branchFlags: input.branchFlags ?? {}
  });
}

function getActiveSpeakerCharacterId(entry: RuntimeDialogueEntry) {
  switch (entry.speaker.type) {
    case "character":
    case "dress_prompt":
    case "cat_name_prompt":
      return entry.speaker.characterId;
    case "narrator":
      return null;
  }
}

export function toPublicStorageUrl(
  supabaseUrl: string,
  storagePath: string | null
) {
  if (!storagePath) {
    return null;
  }

  if (/^https?:\/\//i.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }

  const [bucket, ...rest] = storagePath.split("/");

  if (!bucket || rest.length === 0) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${rest.join("/")}`;
}

function getGlobalRuntimeJsonFetcher(): RuntimeJsonFetcher {
  const fetcher = (globalThis as { fetch?: RuntimeJsonFetcher }).fetch;

  if (!fetcher) {
    throw new Error("Runtime JSON loading requires a global fetch function.");
  }

  return fetcher.bind(globalThis);
}

export async function fetchRuntimeJson<T>(
  supabaseUrl: string,
  storagePath: string,
  options?: {
    fetcher?: RuntimeJsonFetcher;
  }
): Promise<T> {
  const url = toPublicStorageUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error("Runtime storage path is invalid.");
  }

  const fetcher = options?.fetcher ?? getGlobalRuntimeJsonFetcher();
  const response = await fetcher(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to load runtime JSON (${response.status}).`);
  }

  return (await response.json()) as T;
}

export function createRuntimeChapterLoader(input: {
  supabaseUrl: string;
  cache?: Map<string, RuntimeChapterBundle>;
  fetcher?: RuntimeJsonFetcher;
}): RuntimeChapterLoader {
  return async (manifest, chapterId) => {
    const cached = input.cache?.get(chapterId);

    if (cached) {
      return cached;
    }

    const manifestChapter = getManifestChapterById(manifest, chapterId);

    if (!manifestChapter) {
      throw new Error(
        "Requested chapter is not available in runtime manifest."
      );
    }

    const loadedBundle = await fetchRuntimeJson<RuntimeChapterBundle>(
      input.supabaseUrl,
      manifestChapter.bundlePath,
      {
        fetcher: input.fetcher
      }
    );

    input.cache?.set(chapterId, loadedBundle);
    return loadedBundle;
  };
}

export async function loadPlayerRuntimeSession(input: {
  manifestPath: string;
  supabaseUrl: string;
  progress: Pick<
    PlayerProgress,
    "chapterId" | "sceneId" | "dialogueEntryId"
  > | null;
  initialManifest?: RuntimeManifest | null;
  loadChapter?: RuntimeChapterLoader;
  fetcher?: RuntimeJsonFetcher;
}): Promise<PlayerRuntimeSession> {
  const manifest =
    input.initialManifest ??
    (await fetchRuntimeJson<RuntimeManifest>(
      input.supabaseUrl,
      input.manifestPath,
      {
        fetcher: input.fetcher
      }
    ));

  if (!manifest.firstChapterId) {
    return {
      manifest,
      bundle: null,
      readerState: null
    };
  }

  const loadChapter =
    input.loadChapter ??
    createRuntimeChapterLoader({
      supabaseUrl: input.supabaseUrl,
      fetcher: input.fetcher
    });
  const resolvedRuntime = await resolvePlayableRuntimePosition({
    manifest,
    loadChapter,
    progress: input.progress,
    startChapterId: manifest.firstChapterId
  });

  return {
    manifest,
    bundle: resolvedRuntime?.bundle ?? null,
    readerState: resolvedRuntime?.state ?? null
  };
}

export async function loadPlayerRuntimeBootstrap(input: {
  manifestPath: string;
  supabaseUrl: string;
  loadChapter?: RuntimeChapterLoader;
  fetcher?: RuntimeJsonFetcher;
}): Promise<PlayerRuntimeBootstrap> {
  const initialSession = await loadPlayerRuntimeSession({
    manifestPath: input.manifestPath,
    supabaseUrl: input.supabaseUrl,
    progress: null,
    loadChapter: input.loadChapter,
    fetcher: input.fetcher
  });

  return {
    initialManifest: initialSession.manifest,
    initialBundle: initialSession.bundle,
    initialReaderState: initialSession.readerState,
    initialAssetUrls: getPlayerRuntimeAssetUrls({
      supabaseUrl: input.supabaseUrl,
      bundle: initialSession.bundle,
      readerState: initialSession.readerState
    })
  };
}

export function getPlayerRuntimeAssetUrls(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  branchFlags?: PlayerProgress["branchFlags"];
}): PlayerRuntimeAssetUrls {
  if (!input.bundle || !input.readerState) {
    return createEmptyPlayerRuntimeAssetUrls();
  }

  const scene = getCurrentScene(input.bundle.chapter, input.readerState);
  const entry = getCurrentDialogue(input.bundle.chapter, input.readerState);

  if (!scene || !entry) {
    return createEmptyPlayerRuntimeAssetUrls();
  }

  const branchFlags = resolveRuntimeSceneBranchFlags({
    scene,
    branchFlags: input.branchFlags
  });
  const visibleStageImagePaths = getVisiblePlayerStageImagePaths({
    scene,
    entry,
    branchFlags
  });

  return {
    backgroundImageUrl: toPublicStorageUrl(
      input.supabaseUrl,
      scene.backgroundImage?.filePath ?? null
    ),
    leftCharacterImageUrl: toPublicStorageUrl(
      input.supabaseUrl,
      visibleStageImagePaths.leftImagePath
    ),
    rightCharacterImageUrl: toPublicStorageUrl(
      input.supabaseUrl,
      visibleStageImagePaths.rightImagePath
    )
  };
}

export function getPlayerRuntimeStageCharacters(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  branchFlags?: PlayerProgress["branchFlags"];
}): PlayerRuntimeStageCharacter[] {
  if (!input.bundle || !input.readerState) {
    return [];
  }

  const scene = getCurrentScene(input.bundle.chapter, input.readerState);
  const entry = getCurrentDialogue(input.bundle.chapter, input.readerState);

  if (!scene || !entry) {
    return [];
  }

  const branchFlags = resolveRuntimeSceneBranchFlags({
    scene,
    branchFlags: input.branchFlags
  });
  const activeSpeakerCharacterId = getActiveSpeakerCharacterId(entry);
  const stageCharacters: PlayerRuntimeStageCharacter[] = [];
  const addStageCharacter = (
    placement: PlayerRuntimeStagePlacement,
    stageCharacter: RuntimeStageCharacter | null
  ) => {
    if (!stageCharacter) {
      return;
    }

    const imageUrl = toPublicStorageUrl(
      input.supabaseUrl,
      resolveStageCharacterImagePath({
        scene,
        stageCharacter,
        branchFlags
      })
    );

    if (!imageUrl) {
      return;
    }

    stageCharacters.push({
      placement,
      characterId: stageCharacter.characterId,
      characterName: stageCharacter.characterName,
      characterSlug: stageCharacter.characterSlug,
      emotionKey: stageCharacter.emotionKey,
      emotionLabel: stageCharacter.emotionLabel,
      imageUrl,
      isActiveSpeaker: stageCharacter.characterId === activeSpeakerCharacterId
    });
  };

  addStageCharacter("left", entry.stage.left);
  addStageCharacter("right", entry.stage.right);

  return stageCharacters;
}

export function getPlayerRuntimeSceneAssetUrls(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  branchFlags?: PlayerProgress["branchFlags"];
}) {
  return getPlayerRuntimeSceneAssetRefs(input).map((assetRef) => assetRef.url);
}

function getRuntimeSceneAssetRefs(input: {
  supabaseUrl: string;
  scene: RuntimeScene;
  branchFlags?: PlayerProgress["branchFlags"];
}) {
  const branchFlags = resolveRuntimeSceneBranchFlags({
    scene: input.scene,
    branchFlags: input.branchFlags
  });
  const assetRefs = new Map<string, PlayerRuntimeImageAssetRef>();
  const addAssetRef = (asset: {
    role: PlayerRuntimeImageAssetRole;
    storagePath: string | null | undefined;
    assetId?: string | null;
    cacheKey?: string;
  }) => {
    const storagePath = asset.storagePath ?? null;
    const assetUrl = toPublicStorageUrl(input.supabaseUrl, storagePath);

    if (!storagePath || !assetUrl) {
      return;
    }

    assetRefs.set(assetUrl, {
      role: asset.role,
      url: assetUrl,
      storagePath,
      assetId: asset.assetId ?? null,
      cacheKey:
        asset.cacheKey ?? `${asset.role}:${asset.assetId ?? storagePath}`
    });
  };

  addAssetRef({
    role: "background",
    storagePath: input.scene.backgroundImage?.filePath ?? null,
    assetId: input.scene.backgroundImage?.id ?? null
  });

  input.scene.dialogue.forEach((dialogueEntry) => {
    const addStageAssetRef = (stageCharacter: RuntimeStageCharacter | null) => {
      if (!stageCharacter) {
        return;
      }

      const storagePath = resolveStageCharacterImagePath({
        scene: input.scene,
        stageCharacter,
        branchFlags
      });

      addAssetRef({
        role: "portrait",
        storagePath,
        assetId: stageCharacter.characterId,
        cacheKey: `portrait:${stageCharacter.characterId}:${stageCharacter.emotionKey}:${storagePath ?? ""}`
      });
    };

    addStageAssetRef(dialogueEntry.stage.left);
    addStageAssetRef(dialogueEntry.stage.right);

    if (dialogueEntry.speaker.type === "cat_name_prompt") {
      const storagePath = resolveSceneCharacterImagePath({
        scene: input.scene,
        characterId: dialogueEntry.speaker.characterId,
        branchFlags
      });

      addAssetRef({
        role: "portrait",
        storagePath,
        assetId: dialogueEntry.speaker.characterId,
        cacheKey: `portrait:${dialogueEntry.speaker.characterId}:default:${storagePath ?? ""}`
      });
    }

    if (dialogueEntry.speaker.type === "dress_prompt") {
      const characterId = dialogueEntry.speaker.characterId;

      dialogueEntry.speaker.dressOptions.forEach((dressOption) => {
        addAssetRef({
          role: "dress-preview",
          storagePath: dressOption.previewImagePath,
          assetId: characterId,
          cacheKey: `dress-preview:${characterId}:${dressOption.key}`
        });
      });
    }
  });

  return Array.from(assetRefs.values());
}

export function getPlayerRuntimeSceneAssetRefs(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  branchFlags?: PlayerProgress["branchFlags"];
}): PlayerRuntimeImageAssetRef[] {
  if (!input.bundle || !input.readerState) {
    return [];
  }

  const scene = getCurrentScene(input.bundle.chapter, input.readerState);

  if (!scene) {
    return [];
  }

  return getRuntimeSceneAssetRefs({
    supabaseUrl: input.supabaseUrl,
    scene,
    branchFlags: input.branchFlags
  });
}

export function getPlayerRuntimeChapterAssetRefs(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  branchFlags?: PlayerProgress["branchFlags"];
}): PlayerRuntimeImageAssetRef[] {
  if (!input.bundle) {
    return [];
  }

  const assetRefs = new Map<string, PlayerRuntimeImageAssetRef>();

  input.bundle.chapter.scenes.forEach((scene) => {
    getRuntimeSceneAssetRefs({
      supabaseUrl: input.supabaseUrl,
      scene,
      branchFlags: input.branchFlags
    }).forEach((assetRef) => {
      assetRefs.set(assetRef.url, assetRef);
    });
  });

  return Array.from(assetRefs.values());
}

export function decidePlayerResumeAction(input: {
  initialBundle: RuntimeChapterBundle | null;
  storedProgress: PlayerProgress | null;
}): PlayerResumeAction {
  const branchFlags = input.storedProgress?.branchFlags ?? {};

  if (!input.storedProgress) {
    return {
      type: "use-initial-state",
      branchFlags
    };
  }

  if (
    !input.initialBundle ||
    input.storedProgress.chapterId !== input.initialBundle.chapter.id
  ) {
    return {
      type: "load-from-progress",
      branchFlags
    };
  }

  const readerState = createReaderStateFromProgress(
    input.initialBundle.chapter,
    input.storedProgress
  );
  const dialogue = getCurrentDialogue(input.initialBundle.chapter, readerState);

  if (!dialogue) {
    return {
      type: "load-from-progress",
      branchFlags
    };
  }

  return {
    type: "resume-from-initial-bundle",
    branchFlags,
    readerState
  };
}
