import { DialogueKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  advanceReaderProgress,
  canAdvanceFromEntry,
  createInitialReaderProgress,
  createReaderCheckpoint,
  createReaderProgressFromCheckpoint,
  isCheckpointValidForChapter,
  resolveEntryPresentation,
  toPublicMediaUrl
} from "@/lib/story/reader";
import type { ReaderChapter, ReaderEntry } from "@/lib/story/repository";

function makeEntry(input: Partial<ReaderEntry> = {}): ReaderEntry {
  return {
    id: "entry-1",
    kind: DialogueKind.narrator,
    orderIndex: 1,
    text: "Text",
    promptLabel: null,
    character: null,
    ...input
  };
}

const chapterFixture: ReaderChapter = {
  id: "chapter-1",
  title: "Chapter 1",
  slug: "chapter-1",
  orderIndex: 1,
  imagePath: "chapters/ch1.jpg",
  scenes: [
    {
      id: "scene-1",
      title: "Scene 1",
      orderIndex: 1,
      media: {
        backgroundImagePath: null,
        backgroundMusicPath: null
      },
      entries: [
        makeEntry({ id: "entry-1", orderIndex: 1, kind: DialogueKind.narrator }),
        makeEntry({
          id: "entry-2",
          orderIndex: 2,
          kind: DialogueKind.speech,
          character: {
            id: "char-1",
            name: "Ocnoer",
            slug: "ocnoer",
            portraitPath: null
          }
        })
      ]
    },
    {
      id: "scene-2",
      title: "Scene 2",
      orderIndex: 2,
      media: {
        backgroundImagePath: null,
        backgroundMusicPath: null
      },
      entries: [makeEntry({ id: "entry-3", orderIndex: 1 })]
    }
  ]
};

describe("resolveEntryPresentation", () => {
  it("centers narrator entries", () => {
    expect(
      resolveEntryPresentation(makeEntry({ kind: DialogueKind.narrator }))
    ).toEqual({
      alignment: "center",
      portraitSide: null,
      isPrompt: false
    });
  });

  it("places Ocnoer on the left", () => {
    expect(
      resolveEntryPresentation(
        makeEntry({
          kind: DialogueKind.speech,
          character: {
            id: "char-1",
            name: "Ocnoer",
            slug: "ocnoer",
            portraitPath: "portraits/ocnoer/default.png"
          }
        })
      )
    ).toEqual({
      alignment: "left",
      portraitSide: "left",
      isPrompt: false
    });
  });

  it("places non-Ocnoer characters on the right", () => {
    expect(
      resolveEntryPresentation(
        makeEntry({
          kind: DialogueKind.thought,
          character: {
            id: "char-2",
            name: "Alvyn",
            slug: "alvyn-rivers",
            portraitPath: "portraits/alvyn/default.png"
          }
        })
      )
    ).toEqual({
      alignment: "right",
      portraitSide: "right",
      isPrompt: false
    });
  });

  it("renders player prompts as centered read-only prompt cards", () => {
    expect(
      resolveEntryPresentation(makeEntry({ kind: DialogueKind.player_prompt }))
    ).toEqual({
      alignment: "center",
      portraitSide: null,
      isPrompt: true
    });
  });
});

describe("reader checkpoints", () => {
  it("validates checkpoints against the current chapter bundle", () => {
    expect(
      isCheckpointValidForChapter(chapterFixture, {
        chapterPublicId: "chapter-1",
        scenePublicId: "scene-2",
        dialogueEntryPublicId: "entry-3"
      })
    ).toBe(true);

    expect(
      isCheckpointValidForChapter(chapterFixture, {
        chapterPublicId: "chapter-9",
        scenePublicId: "scene-2",
        dialogueEntryPublicId: "entry-3"
      })
    ).toBe(false);
  });

  it("restores reader progress from a valid checkpoint", () => {
    expect(
      createReaderProgressFromCheckpoint(chapterFixture, {
        chapterPublicId: "chapter-1",
        scenePublicId: "scene-2",
        dialogueEntryPublicId: "entry-3"
      })
    ).toEqual({
      sceneIndex: 1,
      entryIndex: 0,
      isChapterComplete: false
    });
  });

  it("falls back to the first entry when checkpoint is invalid", () => {
    expect(
      createReaderProgressFromCheckpoint(chapterFixture, {
        chapterPublicId: "chapter-1",
        scenePublicId: "scene-2",
        dialogueEntryPublicId: "missing-entry"
      })
    ).toEqual({
      sceneIndex: 0,
      entryIndex: 0,
      isChapterComplete: false
    });
  });

  it("serializes the current runtime position into a checkpoint", () => {
    expect(
      createReaderCheckpoint({
        chapter: chapterFixture,
        publishedVersionId: "version-2",
        state: {
          sceneIndex: 1,
          entryIndex: 0,
          isChapterComplete: false
        },
        lastReadAt: "2026-03-15T12:00:00.000Z"
      })
    ).toEqual({
      publishedVersionId: "version-2",
      chapterPublicId: "chapter-1",
      scenePublicId: "scene-2",
      dialogueEntryPublicId: "entry-3",
      lastReadAt: "2026-03-15T12:00:00.000Z"
    });
  });
});

describe("advanceReaderProgress", () => {
  it("advances across entries, scenes, and chapter completion", () => {
    let state = createInitialReaderProgress();
    expect(state).toEqual({
      sceneIndex: 0,
      entryIndex: 0,
      isChapterComplete: false
    });

    state = advanceReaderProgress(chapterFixture, state);
    expect(state).toEqual({
      sceneIndex: 0,
      entryIndex: 1,
      isChapterComplete: false
    });

    state = advanceReaderProgress(chapterFixture, state);
    expect(state).toEqual({
      sceneIndex: 1,
      entryIndex: 0,
      isChapterComplete: false
    });

    state = advanceReaderProgress(chapterFixture, state);
    expect(state).toEqual({
      sceneIndex: 1,
      entryIndex: 0,
      isChapterComplete: true
    });
  });
});

describe("canAdvanceFromEntry", () => {
  it("allows advancing when entry is missing or non-prompt", () => {
    expect(canAdvanceFromEntry(null, new Set())).toBe(true);
    expect(
      canAdvanceFromEntry(makeEntry({ kind: DialogueKind.narrator }), new Set())
    ).toBe(true);
  });

  it("blocks prompt entries until submission id is present", () => {
    const entry = makeEntry({ id: "prompt-1", kind: DialogueKind.player_prompt });

    expect(canAdvanceFromEntry(entry, new Set())).toBe(false);
    expect(canAdvanceFromEntry(entry, new Set(["prompt-1"]))).toBe(true);
  });
});

describe("toPublicMediaUrl", () => {
  it("builds a Supabase public URL from bucket-prefixed paths", () => {
    expect(
      toPublicMediaUrl("https://project.supabase.co", "scenes/ch1/background.jpg")
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/scenes/ch1/background.jpg"
    );
  });

  it("keeps absolute URLs unchanged", () => {
    expect(
      toPublicMediaUrl(
        "https://project.supabase.co",
        "https://cdn.example.com/x.png"
      )
    ).toBe("https://cdn.example.com/x.png");
  });
});
