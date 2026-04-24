import type {
  RuntimeBackgroundMusic,
  RuntimeChapterBundle,
  RuntimeScene
} from "./types";
import type { ReaderState } from "./reader";

export type RuntimeSceneBackgroundMusicResolution =
  | {
      type: "track";
      source: "scene" | "cue";
      backgroundMusic: RuntimeBackgroundMusic;
      cueAfterDialogueEntryId: string | null;
    }
  | {
      type: "silence";
      source: "scene" | "cue";
      cueAfterDialogueEntryId: string | null;
    };

export function findSceneBackgroundMusicById(
  scene: RuntimeScene | null,
  backgroundMusicTrackId: string | null
): RuntimeBackgroundMusic | null {
  if (!scene || !backgroundMusicTrackId) {
    return null;
  }

  if (scene.backgroundMusic?.id === backgroundMusicTrackId) {
    return scene.backgroundMusic;
  }

  return (
    scene.backgroundMusicCues.find(
      (cue) => cue.backgroundMusic?.id === backgroundMusicTrackId
    )?.backgroundMusic ?? null
  );
}

export function resolveSceneBackgroundMusic(input: {
  scene: RuntimeScene | null;
  dialogueIndex: number | null;
}): RuntimeSceneBackgroundMusicResolution {
  if (!input.scene) {
    return {
      type: "silence",
      source: "scene",
      cueAfterDialogueEntryId: null
    };
  }

  let resolution: RuntimeSceneBackgroundMusicResolution = input.scene
    .backgroundMusic
    ? {
        type: "track",
        source: "scene",
        backgroundMusic: input.scene.backgroundMusic,
        cueAfterDialogueEntryId: null
      }
    : {
        type: "silence",
        source: "scene",
        cueAfterDialogueEntryId: null
      };

  if (input.dialogueIndex == null || input.dialogueIndex < 0) {
    return resolution;
  }

  const activeDialogueIndex = input.dialogueIndex;
  const dialogueIndexById = new Map(
    input.scene.dialogue.map((entry, index) => [entry.id, index])
  );
  const orderedCues = [...input.scene.backgroundMusicCues].sort(
    (left, right) => {
      return (
        (dialogueIndexById.get(left.afterDialogueEntryId) ??
          Number.MAX_SAFE_INTEGER) -
        (dialogueIndexById.get(right.afterDialogueEntryId) ??
          Number.MAX_SAFE_INTEGER)
      );
    }
  );

  orderedCues.forEach((cue) => {
    const cueDialogueIndex = dialogueIndexById.get(cue.afterDialogueEntryId);

    if (cueDialogueIndex != null && activeDialogueIndex > cueDialogueIndex) {
      resolution = cue.backgroundMusic
        ? {
            type: "track",
            source: "cue",
            backgroundMusic: cue.backgroundMusic,
            cueAfterDialogueEntryId: cue.afterDialogueEntryId
          }
        : {
            type: "silence",
            source: "cue",
            cueAfterDialogueEntryId: cue.afterDialogueEntryId
          };
    }
  });

  return resolution;
}

export function resolveSceneBackgroundMusicTrackId(input: {
  scene: RuntimeScene | null;
  dialogueIndex: number | null;
}) {
  const resolution = resolveSceneBackgroundMusic(input);

  return resolution.type === "track" ? resolution.backgroundMusic.id : null;
}

export function resolveReaderStateSceneBackgroundMusic(input: {
  bundle: RuntimeChapterBundle | null;
  state: ReaderState | null;
}) {
  if (!input.bundle || !input.state) {
    return resolveSceneBackgroundMusic({
      scene: null,
      dialogueIndex: null
    });
  }

  return resolveSceneBackgroundMusic({
    scene: input.bundle.chapter.scenes[input.state.sceneIndex] ?? null,
    dialogueIndex: input.state.dialogueIndex
  });
}

export function resolveReaderStateSceneBackgroundMusicTrackId(input: {
  bundle: RuntimeChapterBundle | null;
  state: ReaderState | null;
}) {
  const resolution = resolveReaderStateSceneBackgroundMusic(input);

  return resolution.type === "track" ? resolution.backgroundMusic.id : null;
}
