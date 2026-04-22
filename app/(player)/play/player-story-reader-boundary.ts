import type { RuntimeChapterBundle, RuntimeManifest } from "@/lib/story/types";

export type ChapterCardDisplayReason =
  | "initial-entry"
  | "restart"
  | "backtrack"
  | "chapter-break"
  | "resume"
  | "jump";

export type ChapterBreakBoundaryState = {
  type: "chapter-break";
  chapterTitle: string;
  chapterIndex: number;
  chapterCount: number;
};

export type StoryFinishedBoundaryState = {
  type: "story-finished";
  chapterTitle: string;
  chapterIndex: number;
  chapterCount: number;
};

export type PlayerBoundaryState =
  | {
      type: "scene-transition";
    }
  | {
      type: "chapter-opening-card";
      chapterId: string;
      chapterTitle: string;
      text: string;
    }
  | {
      type: "chapter-ending-card";
      chapterId: string;
      chapterTitle: string;
      text: string;
      backgroundMusicFilePath: string | null;
      nextState: ChapterBreakBoundaryState | StoryFinishedBoundaryState;
    }
  | ChapterBreakBoundaryState
  | StoryFinishedBoundaryState;

function normalizeChapterCardText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0 ? normalized : null;
}

function createChapterBreakBoundaryState(input: {
  manifest: RuntimeManifest;
  chapter: RuntimeChapterBundle["chapter"];
}): ChapterBreakBoundaryState {
  const chapterIndex = input.manifest.chapters.findIndex(
    (chapter) => chapter.id === input.chapter.id
  );

  return {
    type: "chapter-break",
    chapterTitle: input.chapter.title,
    chapterIndex: chapterIndex + 1,
    chapterCount: input.manifest.chapters.length
  };
}

function createStoryFinishedBoundaryState(input: {
  manifest: RuntimeManifest;
  chapter: RuntimeChapterBundle["chapter"];
}): StoryFinishedBoundaryState {
  const chapterIndex = input.manifest.chapters.findIndex(
    (chapter) => chapter.id === input.chapter.id
  );

  return {
    type: "story-finished",
    chapterTitle: input.chapter.title,
    chapterIndex: chapterIndex + 1,
    chapterCount: input.manifest.chapters.length
  };
}

export function getChapterOpeningBoundaryState(input: {
  chapter: RuntimeChapterBundle["chapter"];
  reason: ChapterCardDisplayReason;
}): Extract<PlayerBoundaryState, { type: "chapter-opening-card" }> | null {
  if (input.reason === "resume" || input.reason === "jump") {
    return null;
  }

  const text = normalizeChapterCardText(input.chapter.openingCardText);

  if (!text) {
    return null;
  }

  return {
    type: "chapter-opening-card",
    chapterId: input.chapter.id,
    chapterTitle: input.chapter.title,
    text
  };
}

export function createBoundaryStateForAdvance(input: {
  manifest: RuntimeManifest;
  currentChapter: RuntimeChapterBundle["chapter"];
  action:
    | {
        type: "scene-transition";
      }
    | {
        type: "chapter-break";
        nextChapter: RuntimeChapterBundle["chapter"];
      }
    | {
        type: "story-finished";
      };
}): PlayerBoundaryState {
  if (input.action.type === "scene-transition") {
    return {
      type: "scene-transition"
    };
  }

  const nextState =
    input.action.type === "chapter-break"
      ? createChapterBreakBoundaryState({
          manifest: input.manifest,
          chapter: input.action.nextChapter
        })
      : createStoryFinishedBoundaryState({
          manifest: input.manifest,
          chapter: input.currentChapter
        });
  const text = normalizeChapterCardText(input.currentChapter.endingCardText);

  if (!text) {
    return nextState;
  }

  return {
    type: "chapter-ending-card",
    chapterId: input.currentChapter.id,
    chapterTitle: input.currentChapter.title,
    text,
    backgroundMusicFilePath:
      input.currentChapter.endingCardBackgroundMusic?.filePath ?? null,
    nextState
  };
}

export function resolveBoundaryAdvance(input: {
  boundaryState: PlayerBoundaryState;
  currentChapter: RuntimeChapterBundle["chapter"] | null;
}): PlayerBoundaryState | null {
  if (input.boundaryState.type === "chapter-opening-card") {
    return null;
  }

  if (input.boundaryState.type === "chapter-ending-card") {
    if (input.boundaryState.nextState.type === "story-finished") {
      return input.boundaryState;
    }

    return input.boundaryState.nextState;
  }

  if (input.boundaryState.type === "chapter-break") {
    if (!input.currentChapter) {
      return null;
    }

    return getChapterOpeningBoundaryState({
      chapter: input.currentChapter,
      reason: "chapter-break"
    });
  }

  if (input.boundaryState.type === "story-finished") {
    return input.boundaryState;
  }

  return input.boundaryState;
}
