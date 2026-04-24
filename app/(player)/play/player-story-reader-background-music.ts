import type {
  ReaderState,
  RuntimeBackgroundMusic,
  RuntimeChapterBundle,
  RuntimeScene
} from "@ocnoer/story-core";

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

export function resolveSceneBackgroundMusicTrackId(input: {
  scene: RuntimeScene | null;
  dialogueIndex: number | null;
}) {
  if (!input.scene) {
    return null;
  }

  let backgroundMusicTrackId = input.scene.backgroundMusic?.id ?? null;

  if (input.dialogueIndex == null || input.dialogueIndex < 0) {
    return backgroundMusicTrackId;
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
      backgroundMusicTrackId = cue.backgroundMusic?.id ?? null;
    }
  });

  return backgroundMusicTrackId;
}

export function resolveReaderStateSceneBackgroundMusicTrackId(input: {
  bundle: RuntimeChapterBundle | null;
  state: ReaderState | null;
}) {
  if (!input.bundle || !input.state) {
    return null;
  }

  return resolveSceneBackgroundMusicTrackId({
    scene: input.bundle.chapter.scenes[input.state.sceneIndex] ?? null,
    dialogueIndex: input.state.dialogueIndex
  });
}
