import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene
} from "@/lib/story/types";

export const PLAYER_PROGRESS_SCHEMA_VERSION = 1;

export type PlayerProgress = {
  schemaVersion: typeof PLAYER_PROGRESS_SCHEMA_VERSION;
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  branchFlags: Record<string, boolean | number | string>;
  updatedAt: string;
};

export type ReaderState = {
  sceneIndex: number;
  dialogueIndex: number;
  isChapterComplete: boolean;
};

export function createInitialReaderState(): ReaderState {
  return {
    sceneIndex: 0,
    dialogueIndex: 0,
    isChapterComplete: false
  };
}

export function createInitialProgressForChapter(
  chapter: RuntimeChapterBundle["chapter"]
): PlayerProgress | null {
  const scene = chapter.scenes[0];
  const entry = scene?.dialogue[0];

  if (!scene || !entry) {
    return null;
  }

  return {
    schemaVersion: PLAYER_PROGRESS_SCHEMA_VERSION,
    chapterId: chapter.id,
    sceneId: scene.id,
    dialogueEntryId: entry.id,
    branchFlags: {},
    updatedAt: new Date().toISOString()
  };
}

export function isProgressValidForChapter(
  chapter: RuntimeChapterBundle["chapter"],
  progress: Pick<PlayerProgress, "chapterId" | "sceneId" | "dialogueEntryId">
) {
  if (chapter.id !== progress.chapterId) {
    return false;
  }

  const scene = chapter.scenes.find((candidate) => candidate.id === progress.sceneId);

  if (!scene) {
    return false;
  }

  return scene.dialogue.some(
    (candidate) => candidate.id === progress.dialogueEntryId
  );
}

export function createReaderStateFromProgress(
  chapter: RuntimeChapterBundle["chapter"],
  progress: Pick<PlayerProgress, "chapterId" | "sceneId" | "dialogueEntryId"> | null
) {
  if (!progress || !isProgressValidForChapter(chapter, progress)) {
    return createInitialReaderState();
  }

  const sceneIndex = chapter.scenes.findIndex((scene) => scene.id === progress.sceneId);
  const dialogueIndex = chapter.scenes[sceneIndex]?.dialogue.findIndex(
    (entry) => entry.id === progress.dialogueEntryId
  );

  if (sceneIndex < 0 || dialogueIndex == null || dialogueIndex < 0) {
    return createInitialReaderState();
  }

  return {
    sceneIndex,
    dialogueIndex,
    isChapterComplete: false
  };
}

export function createStoredProgress(input: {
  chapter: RuntimeChapterBundle["chapter"];
  state: ReaderState;
  branchFlags?: Record<string, boolean | number | string>;
}) {
  const scene = input.state.isChapterComplete
    ? input.chapter.scenes.at(-1) ?? null
    : getCurrentScene(input.chapter, input.state);
  const entry = input.state.isChapterComplete
    ? scene?.dialogue.at(-1) ?? null
    : getCurrentDialogue(input.chapter, input.state);

  if (!scene || !entry) {
    return null;
  }

  return {
    schemaVersion: PLAYER_PROGRESS_SCHEMA_VERSION,
    chapterId: input.chapter.id,
    sceneId: scene.id,
    dialogueEntryId: entry.id,
    branchFlags: input.branchFlags ?? {},
    updatedAt: new Date().toISOString()
  } satisfies PlayerProgress;
}

export function getCurrentScene(
  chapter: RuntimeChapterBundle["chapter"],
  state: ReaderState
): RuntimeScene | null {
  return chapter.scenes[state.sceneIndex] ?? null;
}

export function getCurrentDialogue(
  chapter: RuntimeChapterBundle["chapter"],
  state: ReaderState
): RuntimeDialogueEntry | null {
  const scene = getCurrentScene(chapter, state);

  if (!scene) {
    return null;
  }

  return scene.dialogue[state.dialogueIndex] ?? null;
}

export function advanceReaderState(
  chapter: RuntimeChapterBundle["chapter"],
  state: ReaderState
): ReaderState {
  if (state.isChapterComplete) {
    return state;
  }

  const scene = chapter.scenes[state.sceneIndex];

  if (!scene) {
    return {
      ...state,
      isChapterComplete: true
    };
  }

  if (state.dialogueIndex + 1 < scene.dialogue.length) {
    return {
      ...state,
      dialogueIndex: state.dialogueIndex + 1
    };
  }

  if (state.sceneIndex + 1 < chapter.scenes.length) {
    return {
      sceneIndex: state.sceneIndex + 1,
      dialogueIndex: 0,
      isChapterComplete: false
    };
  }

  return {
    ...state,
    isChapterComplete: true
  };
}

export function getManifestChapterById(
  manifest: RuntimeManifest,
  chapterId: string
) {
  return manifest.chapters.find((chapter) => chapter.id === chapterId) ?? null;
}

