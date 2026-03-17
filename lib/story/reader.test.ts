import { describe, expect, it } from "vitest";

import {
  advanceReaderState,
  createInitialProgressForChapter,
  createReaderStateFromProgress,
  createStoredProgress
} from "@/lib/story/reader";
import type { RuntimeChapterBundle } from "@/lib/story/types";

const bundle: RuntimeChapterBundle = {
  schemaVersion: 1,
  generatedAt: "2026-03-16T00:00:00.000Z",
  nextChapterId: "chapter_two",
  chapter: {
    id: "chapter_one",
    title: "Chapter One",
    slug: "chapter-one",
    orderIndex: 1,
    scenes: [
      {
        id: "scene_one",
        title: "Scene One",
        orderIndex: 1,
        backgroundImage: {
          id: "bg_one",
          label: "Hall",
          slug: "hall",
          altText: null,
          filePath: "runtime/media/hall.png"
        },
        backgroundMusic: null,
        characterPool: [],
        dialogue: [
          {
            id: "dialogue_one",
            orderIndex: 1,
            text: "Line one",
            speaker: {
              type: "narrator"
            },
            stage: {
              left: null,
              right: null
            }
          },
          {
            id: "dialogue_two",
            orderIndex: 2,
            text: "Line two",
            speaker: {
              type: "narrator"
            },
            stage: {
              left: null,
              right: null
            }
          }
        ]
      },
      {
        id: "scene_two",
        title: "Scene Two",
        orderIndex: 2,
        backgroundImage: {
          id: "bg_two",
          label: "Room",
          slug: "room",
          altText: null,
          filePath: "runtime/media/room.png"
        },
        backgroundMusic: null,
        characterPool: [],
        dialogue: [
          {
            id: "dialogue_three",
            orderIndex: 1,
            text: "Line three",
            speaker: {
              type: "narrator"
            },
            stage: {
              left: null,
              right: null
            }
          }
        ]
      }
    ]
  }
};

describe("reader progress helpers", () => {
  it("creates local progress records using stable chapter, scene, and dialogue ids", () => {
    const initialProgress = createInitialProgressForChapter(bundle.chapter);

    expect(initialProgress).toEqual({
      schemaVersion: 1,
      chapterId: "chapter_one",
      sceneId: "scene_one",
      dialogueEntryId: "dialogue_one",
      branchFlags: {},
      updatedAt: expect.any(String)
    });
  });

  it("restores state from stable ids and advances across scenes", () => {
    const restoredState = createReaderStateFromProgress(bundle.chapter, {
      chapterId: "chapter_one",
      sceneId: "scene_one",
      dialogueEntryId: "dialogue_two"
    });

    expect(restoredState).toEqual({
      sceneIndex: 0,
      dialogueIndex: 1,
      isChapterComplete: false
    });

    const nextState = advanceReaderState(bundle.chapter, restoredState);
    expect(nextState).toEqual({
      sceneIndex: 1,
      dialogueIndex: 0,
      isChapterComplete: false
    });

    const storedProgress = createStoredProgress({
      chapter: bundle.chapter,
      state: nextState
    });

    expect(storedProgress?.sceneId).toBe("scene_two");
    expect(storedProgress?.dialogueEntryId).toBe("dialogue_three");
  });
});

