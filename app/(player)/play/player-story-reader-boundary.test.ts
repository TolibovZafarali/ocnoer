import { describe, expect, it } from "vitest";

import type { RuntimeManifest } from "@/lib/story/types";

import {
  createBoundaryStateForAdvance,
  getChapterOpeningBoundaryState,
  resolveBoundaryAdvance
} from "./player-story-reader-boundary";

function createChapter(input: {
  id: string;
  title: string;
  orderIndex: number;
  openingCardText?: string | null;
  endingCardText?: string | null;
  endingCardBackgroundMusicFilePath?: string | null;
}) {
  return {
    id: input.id,
    title: input.title,
    slug: input.id.replace(/_/g, "-"),
    orderIndex: input.orderIndex,
    openingCardText: input.openingCardText ?? null,
    endingCardText: input.endingCardText ?? null,
    endingCardBackgroundMusic: input.endingCardBackgroundMusicFilePath
      ? {
          id: `${input.id}_ending_music`,
          label: `${input.title} Ending`,
          slug: `${input.id}-ending`,
          filePath: input.endingCardBackgroundMusicFilePath
        }
      : null,
    scenes: []
  };
}

const chapterOne = createChapter({
  id: "chapter_one",
  title: "Chapter One",
  orderIndex: 1,
  openingCardText: "Open chapter one.",
  endingCardText: "Close chapter one.",
  endingCardBackgroundMusicFilePath: "runtime/media/chapter-one-ending.mp3"
});
const chapterTwo = createChapter({
  id: "chapter_two",
  title: "Chapter Two",
  orderIndex: 2,
  openingCardText: "Open chapter two."
});
const manifest: RuntimeManifest = {
  schemaVersion: 1,
  generatedAt: "2026-04-21T00:00:00.000Z",
  firstChapterId: "chapter_one",
  chaptersPath: "runtime/runtime/manifest.json",
  charactersPath: "runtime/runtime/characters.json",
  assetsPath: "runtime/runtime/assets.json",
  chapters: [
    {
      id: "chapter_one",
      title: "Chapter One",
      slug: "chapter-one",
      orderIndex: 1,
      bundlePath: "runtime/runtime/chapters/chapter_one.json"
    },
    {
      id: "chapter_two",
      title: "Chapter Two",
      slug: "chapter-two",
      orderIndex: 2,
      bundlePath: "runtime/runtime/chapters/chapter_two.json"
    }
  ]
};

describe("player story reader boundary helpers", () => {
  it("shows opening cards only for natural chapter entry reasons", () => {
    expect(
      getChapterOpeningBoundaryState({
        chapter: chapterOne,
        reason: "initial-entry"
      })
    ).toEqual({
      type: "chapter-opening-card",
      chapterId: "chapter_one",
      chapterTitle: "Chapter One",
      text: "Open chapter one."
    });

    expect(
      getChapterOpeningBoundaryState({
        chapter: chapterOne,
        reason: "resume"
      })
    ).toBeNull();

    expect(
      getChapterOpeningBoundaryState({
        chapter: chapterOne,
        reason: "backtrack"
      })
    ).toEqual({
      type: "chapter-opening-card",
      chapterId: "chapter_one",
      chapterTitle: "Chapter One",
      text: "Open chapter one."
    });

    expect(
      getChapterOpeningBoundaryState({
        chapter: chapterOne,
        reason: "jump"
      })
    ).toBeNull();
  });

  it("wraps chapter-break advances in an ending card when authored", () => {
    expect(
      createBoundaryStateForAdvance({
        manifest,
        currentChapter: chapterOne,
        action: {
          type: "chapter-break",
          nextChapter: chapterTwo
        }
      })
    ).toEqual({
      type: "chapter-ending-card",
      chapterId: "chapter_one",
      chapterTitle: "Chapter One",
      text: "Close chapter one.",
      backgroundMusicFilePath: "runtime/media/chapter-one-ending.mp3",
      nextState: {
        type: "chapter-break",
        chapterTitle: "Chapter Two",
        chapterIndex: 2,
        chapterCount: 2
      }
    });
  });

  it("wraps final story completion in an ending card when authored", () => {
    expect(
      createBoundaryStateForAdvance({
        manifest,
        currentChapter: chapterOne,
        action: {
          type: "story-finished"
        }
      })
    ).toEqual({
      type: "chapter-ending-card",
      chapterId: "chapter_one",
      chapterTitle: "Chapter One",
      text: "Close chapter one.",
      backgroundMusicFilePath: "runtime/media/chapter-one-ending.mp3",
      nextState: {
        type: "story-finished",
        chapterTitle: "Chapter One",
        chapterIndex: 1,
        chapterCount: 2
      }
    });
  });

  it("advances non-terminal ending cards into chapter breaks", () => {
    const boundaryState = createBoundaryStateForAdvance({
      manifest,
      currentChapter: chapterOne,
      action: {
        type: "chapter-break",
        nextChapter: chapterTwo
      }
    });

    expect(
      resolveBoundaryAdvance({
        boundaryState,
        currentChapter: chapterTwo
      })
    ).toEqual({
      type: "chapter-break",
      chapterTitle: "Chapter Two",
      chapterIndex: 2,
      chapterCount: 2
    });
  });

  it("keeps the final ending card on screen when the story is finished", () => {
    const boundaryState = createBoundaryStateForAdvance({
      manifest,
      currentChapter: chapterOne,
      action: {
        type: "story-finished"
      }
    });

    expect(
      resolveBoundaryAdvance({
        boundaryState,
        currentChapter: chapterOne
      })
    ).toBe(boundaryState);
  });

  it("turns chapter-break continuation into the next chapter opening card", () => {
    expect(
      resolveBoundaryAdvance({
        boundaryState: {
          type: "chapter-break",
          chapterTitle: "Chapter Two",
          chapterIndex: 2,
          chapterCount: 2
        },
        currentChapter: chapterTwo
      })
    ).toEqual({
      type: "chapter-opening-card",
      chapterId: "chapter_two",
      chapterTitle: "Chapter Two",
      text: "Open chapter two."
    });
  });
});
