import { describe, expect, it } from "vitest";

import {
  advanceReaderState,
  advanceRuntimePosition,
  createInitialProgressForChapter,
  createReaderStateFromProgress,
  createStoredProgress,
  findFirstPlayableReaderState,
  resolvePlayableRuntimePosition
} from "@/lib/story/reader";
import type {
  RuntimeChapterBundle,
  RuntimeManifest,
  RuntimeScene
} from "@/lib/story/types";

function createScene(input: {
  id: string;
  title: string;
  orderIndex: number;
  dialogueIds: string[];
}): RuntimeScene {
  return {
    id: input.id,
    title: input.title,
    orderIndex: input.orderIndex,
    backgroundImage: {
      id: `bg_${input.id}`,
      label: `Background ${input.title}`,
      slug: `background-${input.id}`,
      altText: null,
      filePath: `runtime/media/${input.id}.png`
    },
    backgroundMusic: null,
    characterPool: [],
    dialogue: input.dialogueIds.map((dialogueId, index) => ({
      id: dialogueId,
      orderIndex: index + 1,
      text: `${dialogueId} text`,
      speaker: {
        type: "narrator"
      },
      stage: {
        left: null,
        right: null
      }
    }))
  };
}

function createBundle(input: {
  chapterId: string;
  title: string;
  orderIndex: number;
  nextChapterId: string | null;
  scenes: RuntimeScene[];
}): RuntimeChapterBundle {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-16T00:00:00.000Z",
    nextChapterId: input.nextChapterId,
    chapter: {
      id: input.chapterId,
      title: input.title,
      slug: input.chapterId.replace(/_/g, "-"),
      orderIndex: input.orderIndex,
      scenes: input.scenes
    }
  };
}

const bundleWithSceneGaps = createBundle({
  chapterId: "chapter_one",
  title: "Chapter One",
  orderIndex: 1,
  nextChapterId: "chapter_two",
  scenes: [
    createScene({
      id: "scene_zero",
      title: "Scene Zero",
      orderIndex: 1,
      dialogueIds: []
    }),
    createScene({
      id: "scene_one",
      title: "Scene One",
      orderIndex: 2,
      dialogueIds: ["dialogue_one", "dialogue_two"]
    }),
    createScene({
      id: "scene_two",
      title: "Scene Two",
      orderIndex: 3,
      dialogueIds: []
    }),
    createScene({
      id: "scene_three",
      title: "Scene Three",
      orderIndex: 4,
      dialogueIds: ["dialogue_three"]
    })
  ]
});

const alphaBundle = createBundle({
  chapterId: "chapter_alpha",
  title: "Chapter Alpha",
  orderIndex: 1,
  nextChapterId: "chapter_beta",
  scenes: [
    createScene({
      id: "alpha_scene",
      title: "Alpha Scene",
      orderIndex: 1,
      dialogueIds: ["alpha_line"]
    })
  ]
});

const betaBundle = createBundle({
  chapterId: "chapter_beta",
  title: "Chapter Beta",
  orderIndex: 2,
  nextChapterId: "chapter_gamma",
  scenes: [
    createScene({
      id: "beta_scene",
      title: "Beta Scene",
      orderIndex: 1,
      dialogueIds: []
    })
  ]
});

const gammaBundle = createBundle({
  chapterId: "chapter_gamma",
  title: "Chapter Gamma",
  orderIndex: 3,
  nextChapterId: null,
  scenes: [
    createScene({
      id: "gamma_scene_zero",
      title: "Gamma Scene Zero",
      orderIndex: 1,
      dialogueIds: []
    }),
    createScene({
      id: "gamma_scene_one",
      title: "Gamma Scene One",
      orderIndex: 2,
      dialogueIds: ["gamma_line"]
    })
  ]
});

const manifest: RuntimeManifest = {
  schemaVersion: 1,
  generatedAt: "2026-03-16T00:00:00.000Z",
  firstChapterId: "chapter_alpha",
  chaptersPath: "runtime/runtime/manifest.json",
  charactersPath: "runtime/runtime/characters.json",
  assetsPath: "runtime/runtime/assets.json",
  chapters: [
    {
      id: "chapter_alpha",
      title: "Chapter Alpha",
      slug: "chapter-alpha",
      orderIndex: 1,
      bundlePath: "runtime/runtime/chapters/chapter_alpha.json"
    },
    {
      id: "chapter_beta",
      title: "Chapter Beta",
      slug: "chapter-beta",
      orderIndex: 2,
      bundlePath: "runtime/runtime/chapters/chapter_beta.json"
    },
    {
      id: "chapter_gamma",
      title: "Chapter Gamma",
      slug: "chapter-gamma",
      orderIndex: 3,
      bundlePath: "runtime/runtime/chapters/chapter_gamma.json"
    }
  ]
};

const bundlesById = new Map(
  [alphaBundle, betaBundle, gammaBundle].map((bundle) => [
    bundle.chapter.id,
    bundle
  ])
);

async function loadChapterBundle(
  _manifest: RuntimeManifest,
  chapterId: string
) {
  const bundle = bundlesById.get(chapterId);

  if (!bundle) {
    throw new Error(`Missing test bundle for ${chapterId}.`);
  }

  return bundle;
}

describe("reader progress helpers", () => {
  it("creates progress from the first playable dialogue line instead of an empty opening scene", () => {
    const initialProgress = createInitialProgressForChapter(
      bundleWithSceneGaps.chapter
    );

    expect(initialProgress).toEqual({
      schemaVersion: 1,
      chapterId: "chapter_one",
      sceneId: "scene_one",
      dialogueEntryId: "dialogue_one",
      branchFlags: {},
      updatedAt: expect.any(String)
    });
  });

  it("recovers stale progress to the next playable scene or first playable line", () => {
    expect(findFirstPlayableReaderState(bundleWithSceneGaps.chapter)).toEqual({
      sceneIndex: 1,
      dialogueIndex: 0,
      isChapterComplete: false
    });

    expect(
      createReaderStateFromProgress(bundleWithSceneGaps.chapter, {
        chapterId: "chapter_one",
        sceneId: "scene_two",
        dialogueEntryId: "missing_dialogue"
      })
    ).toEqual({
      sceneIndex: 3,
      dialogueIndex: 0,
      isChapterComplete: false
    });

    expect(
      createReaderStateFromProgress(bundleWithSceneGaps.chapter, {
        chapterId: "chapter_one",
        sceneId: "scene_one",
        dialogueEntryId: "missing_dialogue"
      })
    ).toEqual({
      sceneIndex: 1,
      dialogueIndex: 0,
      isChapterComplete: false
    });
  });

  it("advances across empty scenes and stores the recovered dialogue id", () => {
    const restoredState = createReaderStateFromProgress(
      bundleWithSceneGaps.chapter,
      {
        chapterId: "chapter_one",
        sceneId: "scene_one",
        dialogueEntryId: "dialogue_two"
      }
    );

    const nextState = advanceReaderState(
      bundleWithSceneGaps.chapter,
      restoredState
    );

    expect(nextState).toEqual({
      sceneIndex: 3,
      dialogueIndex: 0,
      isChapterComplete: false
    });

    const storedProgress = createStoredProgress({
      chapter: bundleWithSceneGaps.chapter,
      state: nextState
    });

    expect(storedProgress?.sceneId).toBe("scene_three");
    expect(storedProgress?.dialogueEntryId).toBe("dialogue_three");
  });
});

describe("runtime position resolution", () => {
  it("finds the next playable chapter when the current chapter is unplayable", async () => {
    const resolvedPosition = await resolvePlayableRuntimePosition({
      manifest,
      loadChapter: loadChapterBundle,
      progress: {
        chapterId: "chapter_beta",
        sceneId: "beta_scene",
        dialogueEntryId: "missing_dialogue"
      },
      startChapterId: manifest.firstChapterId
    });

    expect(resolvedPosition?.bundle.chapter.id).toBe("chapter_gamma");
    expect(resolvedPosition?.state).toEqual({
      sceneIndex: 1,
      dialogueIndex: 0,
      isChapterComplete: false
    });
  });
});

describe("runtime advancement", () => {
  it("returns a scene transition when the next playable line is in a later scene", async () => {
    const result = await advanceRuntimePosition({
      manifest,
      bundle: bundleWithSceneGaps,
      state: {
        sceneIndex: 1,
        dialogueIndex: 1,
        isChapterComplete: false
      },
      loadChapter: loadChapterBundle
    });

    expect(result).toEqual({
      type: "scene-transition",
      state: {
        sceneIndex: 3,
        dialogueIndex: 0,
        isChapterComplete: false
      }
    });
  });

  it("returns a chapter break when it skips unplayable chapters to the next playable one", async () => {
    const result = await advanceRuntimePosition({
      manifest,
      bundle: alphaBundle,
      state: {
        sceneIndex: 0,
        dialogueIndex: 0,
        isChapterComplete: false
      },
      loadChapter: loadChapterBundle
    });

    expect(result).toEqual({
      type: "chapter-break",
      bundle: gammaBundle,
      state: {
        sceneIndex: 1,
        dialogueIndex: 0,
        isChapterComplete: false
      }
    });
  });

  it("returns story finished when no later playable chapter exists", async () => {
    const result = await advanceRuntimePosition({
      manifest,
      bundle: gammaBundle,
      state: {
        sceneIndex: 1,
        dialogueIndex: 0,
        isChapterComplete: false
      },
      loadChapter: loadChapterBundle
    });

    expect(result).toEqual({
      type: "story-finished"
    });
  });
});
