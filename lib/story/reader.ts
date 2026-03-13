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

export function createInitialReaderProgress(): ReaderProgressState {
  return {
    sceneIndex: 0,
    entryIndex: 0,
    isChapterComplete: false
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
