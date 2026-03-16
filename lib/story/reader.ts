import { DialogueKind } from "@prisma/client";

import type { ReaderChapter, ReaderEntry } from "@/lib/story/repository";

export type PortraitSide = "left" | "right";

export type ReaderEntryPresentation = {
  alignment: "left" | "right" | "center";
  portraitSide: PortraitSide | null;
  isPrompt: boolean;
};

export type ReaderProgressState = {
  sceneIndex: number;
  entryIndex: number;
  isChapterComplete: boolean;
};

export type ReaderCheckpoint = {
  publishedVersionId: string;
  chapterPublicId: string;
  scenePublicId: string;
  dialogueEntryPublicId: string;
  lastReadAt: string;
};

export function createInitialReaderProgress(): ReaderProgressState {
  return {
    sceneIndex: 0,
    entryIndex: 0,
    isChapterComplete: false
  };
}

export function isCheckpointValidForChapter(
  chapter: ReaderChapter,
  checkpoint: Pick<
    ReaderCheckpoint,
    "chapterPublicId" | "scenePublicId" | "dialogueEntryPublicId"
  >
) {
  if (chapter.id !== checkpoint.chapterPublicId) {
    return false;
  }

  const scene = chapter.scenes.find(
    (candidate) => candidate.id === checkpoint.scenePublicId
  );

  if (!scene) {
    return false;
  }

  return scene.entries.some(
    (candidate) => candidate.id === checkpoint.dialogueEntryPublicId
  );
}

export function createReaderProgressFromCheckpoint(
  chapter: ReaderChapter,
  checkpoint:
    | Pick<ReaderCheckpoint, "chapterPublicId" | "scenePublicId" | "dialogueEntryPublicId">
    | null
) {
  if (!checkpoint || !isCheckpointValidForChapter(chapter, checkpoint)) {
    return createInitialReaderProgress();
  }

  const sceneIndex = chapter.scenes.findIndex(
    (scene) => scene.id === checkpoint.scenePublicId
  );
  const entryIndex = chapter.scenes[sceneIndex]?.entries.findIndex(
    (entry) => entry.id === checkpoint.dialogueEntryPublicId
  );

  if (sceneIndex < 0 || entryIndex == null || entryIndex < 0) {
    return createInitialReaderProgress();
  }

  return {
    sceneIndex,
    entryIndex,
    isChapterComplete: false
  };
}

export function createReaderCheckpoint(input: {
  chapter: ReaderChapter;
  publishedVersionId: string;
  state: ReaderProgressState;
  lastReadAt?: string;
}): ReaderCheckpoint | null {
  const currentScene = input.state.isChapterComplete
    ? input.chapter.scenes.at(-1) ?? null
    : getCurrentScene(input.chapter, input.state);

  if (!currentScene) {
    return null;
  }

  const currentEntry = input.state.isChapterComplete
    ? currentScene.entries.at(-1) ?? null
    : getCurrentEntry(input.chapter, input.state) ?? currentScene.entries.at(-1) ?? null;

  if (!currentEntry) {
    return null;
  }

  return {
    publishedVersionId: input.publishedVersionId,
    chapterPublicId: input.chapter.id,
    scenePublicId: currentScene.id,
    dialogueEntryPublicId: currentEntry.id,
    lastReadAt: input.lastReadAt ?? new Date().toISOString()
  };
}

export function resolveEntryPresentation(
  entry: ReaderEntry
): ReaderEntryPresentation {
  if (entry.kind === DialogueKind.narrator) {
    return {
      alignment: "center",
      portraitSide: null,
      isPrompt: false
    };
  }

  if (entry.kind === DialogueKind.player_prompt) {
    return {
      alignment: "center",
      portraitSide: null,
      isPrompt: true
    };
  }

  if (!entry.character) {
    return {
      alignment: "center",
      portraitSide: null,
      isPrompt: false
    };
  }

  const portraitSide: PortraitSide =
    entry.character.slug === "ocnoer" ? "left" : "right";

  return {
    alignment: portraitSide,
    portraitSide,
    isPrompt: false
  };
}

export function getCurrentScene(
  chapter: ReaderChapter,
  state: ReaderProgressState
) {
  return chapter.scenes[state.sceneIndex] ?? null;
}

export function getCurrentEntry(
  chapter: ReaderChapter,
  state: ReaderProgressState
) {
  const scene = getCurrentScene(chapter, state);

  if (!scene) {
    return null;
  }

  return scene.entries[state.entryIndex] ?? null;
}

export function canAdvanceFromEntry(
  entry: ReaderEntry | null,
  submittedPromptEntryIds: ReadonlySet<string>
) {
  if (!entry) {
    return true;
  }

  if (entry.kind !== DialogueKind.player_prompt) {
    return true;
  }

  return submittedPromptEntryIds.has(entry.id);
}

export function advanceReaderProgress(
  chapter: ReaderChapter,
  state: ReaderProgressState
): ReaderProgressState {
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

  const hasEntry = state.entryIndex < scene.entries.length;

  if (hasEntry && state.entryIndex + 1 < scene.entries.length) {
    return {
      ...state,
      entryIndex: state.entryIndex + 1
    };
  }

  if (state.sceneIndex + 1 < chapter.scenes.length) {
    return {
      sceneIndex: state.sceneIndex + 1,
      entryIndex: 0,
      isChapterComplete: false
    };
  }

  return {
    ...state,
    isChapterComplete: true
  };
}

export function toPublicMediaUrl(
  supabaseUrl: string,
  storagePath: string | null
): string | null {
  if (!storagePath) {
    return null;
  }

  const normalized = storagePath.trim();

  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }

  const [bucket, ...rest] = normalized.split("/");

  if (!bucket || rest.length === 0) {
    return `/${normalized}`;
  }

  const objectPath = rest.join("/");

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}
