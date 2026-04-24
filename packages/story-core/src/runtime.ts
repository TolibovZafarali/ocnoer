import {
  createReaderStateFromProgress,
  getCurrentDialogue,
  getCurrentScene,
  type PlayerProgress,
  type ReaderState
} from "./reader";
import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeScene,
  RuntimeStageCharacter
} from "./types";
import { getSelectedDressKey, resolveDressImagePath } from "./wardrobe";

export type PlayerRuntimeAssetUrls = {
  backgroundImageUrl: string | null;
  leftCharacterImageUrl: string | null;
  rightCharacterImageUrl: string | null;
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

  const visibleStageImagePaths = getVisiblePlayerStageImagePaths({
    scene,
    entry,
    branchFlags: input.branchFlags ?? {}
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

export function getPlayerRuntimeSceneAssetUrls(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  branchFlags?: PlayerProgress["branchFlags"];
}) {
  if (!input.bundle || !input.readerState) {
    return [];
  }

  const scene = getCurrentScene(input.bundle.chapter, input.readerState);

  if (!scene) {
    return [];
  }

  const branchFlags = input.branchFlags ?? {};
  const assetUrls = new Set<string>();
  const addAssetUrl = (storagePath: string | null | undefined) => {
    const assetUrl = toPublicStorageUrl(input.supabaseUrl, storagePath ?? null);

    if (assetUrl) {
      assetUrls.add(assetUrl);
    }
  };

  addAssetUrl(scene.backgroundImage?.filePath ?? null);

  scene.dialogue.forEach((dialogueEntry) => {
    addAssetUrl(
      resolveStageCharacterImagePath({
        scene,
        stageCharacter: dialogueEntry.stage.left,
        branchFlags
      })
    );
    addAssetUrl(
      resolveStageCharacterImagePath({
        scene,
        stageCharacter: dialogueEntry.stage.right,
        branchFlags
      })
    );

    if (dialogueEntry.speaker.type === "cat_name_prompt") {
      addAssetUrl(
        resolveSceneCharacterImagePath({
          scene,
          characterId: dialogueEntry.speaker.characterId,
          branchFlags
        })
      );
    }

    if (dialogueEntry.speaker.type === "dress_prompt") {
      dialogueEntry.speaker.dressOptions.forEach((dressOption) => {
        addAssetUrl(dressOption.previewImagePath);
      });
    }
  });

  return Array.from(assetUrls);
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
