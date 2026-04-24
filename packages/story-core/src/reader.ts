import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene
} from "./types";

export const PLAYER_PROGRESS_SCHEMA_VERSION = 1;

export type PlayerProgress = {
  schemaVersion: typeof PLAYER_PROGRESS_SCHEMA_VERSION;
  chapterId: string;
  sceneId: string;
  dialogueEntryId: string;
  branchFlags: Record<string, boolean | number | string>;
  updatedAt: string;
};

export type PlayerProgressConflictSource = "local" | "server" | "none";

export type PlayerProgressConflictResolution = {
  progress: PlayerProgress | null;
  source: PlayerProgressConflictSource;
};

export type ReaderState = {
  sceneIndex: number;
  dialogueIndex: number;
  isChapterComplete: boolean;
};

export type ReaderAdvanceResult =
  | {
      type: "line";
      state: ReaderState;
    }
  | {
      type: "scene-transition";
      state: ReaderState;
    }
  | {
      type: "chapter-break";
      bundle: RuntimeChapterBundle;
      state: ReaderState;
    }
  | {
      type: "story-finished";
    };

export type ReaderRetreatResult =
  | {
      type: "line";
      state: ReaderState;
    }
  | {
      type: "scene-transition";
      state: ReaderState;
    }
  | {
      type: "chapter-return";
      bundle: RuntimeChapterBundle;
      state: ReaderState;
    }
  | {
      type: "story-start";
    };

export type RuntimeChapterLoader = (
  manifest: RuntimeManifest,
  chapterId: string
) => Promise<RuntimeChapterBundle>;

export function createInitialReaderState(): ReaderState {
  return {
    sceneIndex: 0,
    dialogueIndex: 0,
    isChapterComplete: false
  };
}

function isBranchFlagValue(value: unknown) {
  return (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string"
  );
}

function isBranchFlagsRecord(
  value: unknown
): value is PlayerProgress["branchFlags"] {
  return (
    typeof value === "object" &&
    value != null &&
    !Array.isArray(value) &&
    Object.values(value).every(isBranchFlagValue)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidProgressUpdatedAt(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parsePlayerProgress(value: unknown): PlayerProgress | null {
  if (typeof value !== "object" || value == null) {
    return null;
  }

  const candidate = value as {
    schemaVersion?: unknown;
    chapterId?: unknown;
    sceneId?: unknown;
    dialogueEntryId?: unknown;
    branchFlags?: unknown;
    updatedAt?: unknown;
  };

  if (
    candidate.schemaVersion !== PLAYER_PROGRESS_SCHEMA_VERSION ||
    !isNonEmptyString(candidate.chapterId) ||
    !isNonEmptyString(candidate.sceneId) ||
    !isNonEmptyString(candidate.dialogueEntryId) ||
    !isBranchFlagsRecord(candidate.branchFlags) ||
    !isValidProgressUpdatedAt(candidate.updatedAt)
  ) {
    return null;
  }

  return {
    schemaVersion: PLAYER_PROGRESS_SCHEMA_VERSION,
    chapterId: candidate.chapterId,
    sceneId: candidate.sceneId,
    dialogueEntryId: candidate.dialogueEntryId,
    branchFlags: candidate.branchFlags,
    updatedAt: candidate.updatedAt
  };
}

export function comparePlayerProgressUpdatedAt(
  left: Pick<PlayerProgress, "updatedAt">,
  right: Pick<PlayerProgress, "updatedAt">
) {
  return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
}

export function resolvePlayerProgressConflict(input: {
  localProgress: PlayerProgress | null;
  serverProgress: PlayerProgress | null;
}): PlayerProgressConflictResolution {
  if (!input.localProgress && !input.serverProgress) {
    return {
      progress: null,
      source: "none"
    };
  }

  if (!input.localProgress) {
    return {
      progress: input.serverProgress,
      source: "server"
    };
  }

  if (!input.serverProgress) {
    return {
      progress: input.localProgress,
      source: "local"
    };
  }

  if (
    comparePlayerProgressUpdatedAt(input.localProgress, input.serverProgress) >
    0
  ) {
    return {
      progress: input.localProgress,
      source: "local"
    };
  }

  return {
    progress: input.serverProgress,
    source: "server"
  };
}

function createPlayableReaderState(
  sceneIndex: number,
  dialogueIndex: number
): ReaderState {
  return {
    sceneIndex,
    dialogueIndex,
    isChapterComplete: false
  };
}

function findNextPlayableSceneState(
  chapter: RuntimeChapterBundle["chapter"],
  startSceneIndex: number
) {
  for (
    let sceneIndex = startSceneIndex;
    sceneIndex < chapter.scenes.length;
    sceneIndex += 1
  ) {
    const scene = chapter.scenes[sceneIndex];

    if (scene && scene.dialogue.length > 0) {
      return createPlayableReaderState(sceneIndex, 0);
    }
  }

  return null;
}

function findPreviousPlayableSceneState(
  chapter: RuntimeChapterBundle["chapter"],
  startSceneIndex: number
) {
  for (let sceneIndex = startSceneIndex; sceneIndex >= 0; sceneIndex -= 1) {
    const scene = chapter.scenes[sceneIndex];

    if (scene && scene.dialogue.length > 0) {
      return createPlayableReaderState(sceneIndex, scene.dialogue.length - 1);
    }
  }

  return null;
}

export function findFirstPlayableReaderState(
  chapter: RuntimeChapterBundle["chapter"]
) {
  return findNextPlayableSceneState(chapter, 0);
}

export function findLastPlayableReaderState(
  chapter: RuntimeChapterBundle["chapter"]
) {
  return findPreviousPlayableSceneState(chapter, chapter.scenes.length - 1);
}

export function createInitialProgressForChapter(
  chapter: RuntimeChapterBundle["chapter"]
): PlayerProgress | null {
  const initialState = findFirstPlayableReaderState(chapter);
  const scene = initialState ? getCurrentScene(chapter, initialState) : null;
  const entry = initialState ? getCurrentDialogue(chapter, initialState) : null;

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

  const scene = chapter.scenes.find(
    (candidate) => candidate.id === progress.sceneId
  );

  if (!scene) {
    return false;
  }

  return scene.dialogue.some(
    (candidate) => candidate.id === progress.dialogueEntryId
  );
}

export function createReaderStateFromProgress(
  chapter: RuntimeChapterBundle["chapter"],
  progress: Pick<
    PlayerProgress,
    "chapterId" | "sceneId" | "dialogueEntryId"
  > | null
) {
  if (!progress) {
    return findFirstPlayableReaderState(chapter) ?? createInitialReaderState();
  }

  if (isProgressValidForChapter(chapter, progress)) {
    const sceneIndex = chapter.scenes.findIndex(
      (scene) => scene.id === progress.sceneId
    );
    const dialogueIndex = chapter.scenes[sceneIndex]?.dialogue.findIndex(
      (entry) => entry.id === progress.dialogueEntryId
    );

    if (sceneIndex >= 0 && dialogueIndex != null && dialogueIndex >= 0) {
      return createPlayableReaderState(sceneIndex, dialogueIndex);
    }
  }

  if (chapter.id !== progress.chapterId) {
    return findFirstPlayableReaderState(chapter) ?? createInitialReaderState();
  }

  const sceneIndex = chapter.scenes.findIndex(
    (scene) => scene.id === progress.sceneId
  );

  if (sceneIndex < 0) {
    return findFirstPlayableReaderState(chapter) ?? createInitialReaderState();
  }

  const scene = chapter.scenes[sceneIndex];

  if (!scene || scene.dialogue.length === 0) {
    return (
      findNextPlayableSceneState(chapter, sceneIndex + 1) ??
      findFirstPlayableReaderState(chapter) ??
      createInitialReaderState()
    );
  }

  return createPlayableReaderState(sceneIndex, 0);
}

export function findNextPlayableReaderState(
  chapter: RuntimeChapterBundle["chapter"],
  state: ReaderState
) {
  const scene = chapter.scenes[state.sceneIndex];

  if (!scene) {
    const nextSceneState = findNextPlayableSceneState(
      chapter,
      state.sceneIndex + 1
    );

    return nextSceneState
      ? {
          type: "scene-transition" as const,
          state: nextSceneState
        }
      : null;
  }

  if (state.dialogueIndex + 1 < scene.dialogue.length) {
    return {
      type: "line" as const,
      state: createPlayableReaderState(
        state.sceneIndex,
        state.dialogueIndex + 1
      )
    };
  }

  const nextSceneState = findNextPlayableSceneState(
    chapter,
    state.sceneIndex + 1
  );

  if (!nextSceneState) {
    return null;
  }

  return {
    type: "scene-transition" as const,
    state: nextSceneState
  };
}

export function findPreviousPlayableReaderState(
  chapter: RuntimeChapterBundle["chapter"],
  state: ReaderState
) {
  if (state.isChapterComplete) {
    const lastPlayableState = findLastPlayableReaderState(chapter);

    if (!lastPlayableState) {
      return null;
    }

    return {
      type: "scene-transition" as const,
      state: lastPlayableState
    };
  }

  const scene = chapter.scenes[state.sceneIndex];

  if (
    scene &&
    state.dialogueIndex > 0 &&
    state.dialogueIndex < scene.dialogue.length
  ) {
    return {
      type: "line" as const,
      state: createPlayableReaderState(
        state.sceneIndex,
        state.dialogueIndex - 1
      )
    };
  }

  if (
    scene &&
    state.dialogueIndex >= scene.dialogue.length &&
    scene.dialogue.length > 0
  ) {
    return {
      type: "line" as const,
      state: createPlayableReaderState(
        state.sceneIndex,
        scene.dialogue.length - 1
      )
    };
  }

  const previousSceneState = findPreviousPlayableSceneState(
    chapter,
    state.sceneIndex - 1
  );

  if (!previousSceneState) {
    return null;
  }

  return {
    type: "scene-transition" as const,
    state: previousSceneState
  };
}

export function createStoredProgress(input: {
  chapter: RuntimeChapterBundle["chapter"];
  state: ReaderState;
  branchFlags?: Record<string, boolean | number | string>;
}) {
  const scene = input.state.isChapterComplete
    ? (input.chapter.scenes.at(-1) ?? null)
    : getCurrentScene(input.chapter, input.state);
  const entry = input.state.isChapterComplete
    ? (scene?.dialogue.at(-1) ?? null)
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
  const nextState = findNextPlayableReaderState(chapter, state);

  if (nextState) {
    return nextState.state;
  }

  if (state.isChapterComplete) {
    return state;
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

function getManifestChapterIndex(manifest: RuntimeManifest, chapterId: string) {
  return manifest.chapters.findIndex((chapter) => chapter.id === chapterId);
}

function getPlayableStateForBundle(
  bundle: RuntimeChapterBundle,
  progress: Pick<
    PlayerProgress,
    "chapterId" | "sceneId" | "dialogueEntryId"
  > | null
) {
  const state =
    progress && progress.chapterId === bundle.chapter.id
      ? createReaderStateFromProgress(bundle.chapter, progress)
      : findFirstPlayableReaderState(bundle.chapter);

  if (!state || !getCurrentDialogue(bundle.chapter, state)) {
    return null;
  }

  return state;
}

export async function resolvePlayableRuntimePosition(input: {
  manifest: RuntimeManifest;
  loadChapter: RuntimeChapterLoader;
  progress: Pick<
    PlayerProgress,
    "chapterId" | "sceneId" | "dialogueEntryId"
  > | null;
  startChapterId?: string | null;
}) {
  if (input.manifest.chapters.length === 0) {
    return null;
  }

  const fallbackChapterId =
    input.startChapterId ??
    input.manifest.firstChapterId ??
    input.manifest.chapters[0]?.id ??
    null;
  const preferredChapterId =
    input.progress?.chapterId ?? fallbackChapterId ?? null;

  if (!preferredChapterId) {
    return null;
  }

  const fallbackIndex = Math.max(
    0,
    getManifestChapterIndex(
      input.manifest,
      fallbackChapterId ?? input.manifest.chapters[0]?.id ?? preferredChapterId
    )
  );
  const preferredIndex = getManifestChapterIndex(
    input.manifest,
    preferredChapterId
  );
  const startIndex = preferredIndex >= 0 ? preferredIndex : fallbackIndex;

  const orderedChapters = [
    ...input.manifest.chapters.slice(startIndex),
    ...input.manifest.chapters.slice(0, startIndex)
  ];

  for (const manifestChapter of orderedChapters) {
    const bundle = await input.loadChapter(input.manifest, manifestChapter.id);
    const state = getPlayableStateForBundle(
      bundle,
      input.progress?.chapterId === manifestChapter.id ? input.progress : null
    );

    if (state) {
      return {
        bundle,
        state
      };
    }
  }

  return null;
}

export async function advanceRuntimePosition(input: {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle;
  state: ReaderState;
  loadChapter: RuntimeChapterLoader;
}): Promise<ReaderAdvanceResult> {
  const nextState = findNextPlayableReaderState(
    input.bundle.chapter,
    input.state
  );

  if (nextState) {
    return nextState;
  }

  const currentChapterIndex = getManifestChapterIndex(
    input.manifest,
    input.bundle.chapter.id
  );

  if (currentChapterIndex < 0) {
    return {
      type: "story-finished"
    };
  }

  for (
    let chapterIndex = currentChapterIndex + 1;
    chapterIndex < input.manifest.chapters.length;
    chapterIndex += 1
  ) {
    const manifestChapter = input.manifest.chapters[chapterIndex];

    if (!manifestChapter) {
      continue;
    }

    const bundle = await input.loadChapter(input.manifest, manifestChapter.id);
    const state = findFirstPlayableReaderState(bundle.chapter);

    if (state && getCurrentDialogue(bundle.chapter, state)) {
      return {
        type: "chapter-break",
        bundle,
        state
      };
    }
  }

  return {
    type: "story-finished"
  };
}

export async function retreatRuntimePosition(input: {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle;
  state: ReaderState;
  loadChapter: RuntimeChapterLoader;
}): Promise<ReaderRetreatResult> {
  const previousState = findPreviousPlayableReaderState(
    input.bundle.chapter,
    input.state
  );

  if (previousState) {
    return previousState;
  }

  const currentChapterIndex = getManifestChapterIndex(
    input.manifest,
    input.bundle.chapter.id
  );

  if (currentChapterIndex < 0) {
    return {
      type: "story-start"
    };
  }

  for (
    let chapterIndex = currentChapterIndex - 1;
    chapterIndex >= 0;
    chapterIndex -= 1
  ) {
    const manifestChapter = input.manifest.chapters[chapterIndex];

    if (!manifestChapter) {
      continue;
    }

    const bundle = await input.loadChapter(input.manifest, manifestChapter.id);
    const state = findLastPlayableReaderState(bundle.chapter);

    if (state && getCurrentDialogue(bundle.chapter, state)) {
      return {
        type: "chapter-return",
        bundle,
        state
      };
    }
  }

  return {
    type: "story-start"
  };
}
