import { describe, expect, it } from "vitest";

import type {
  RuntimeBackgroundMusic,
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeScene
} from "@ocnoer/story-core";

import { resolveNativeReaderBackgroundMusicCue } from "./nativeBackgroundMusicCue";

const supabaseUrl = "https://example.supabase.co";
const sharedMusic: RuntimeBackgroundMusic = {
  id: "music_theme",
  label: "Theme",
  slug: "theme",
  filePath: "runtime/media/background-music/theme"
};
const cueMusic: RuntimeBackgroundMusic = {
  id: "music_cue",
  label: "Cue",
  slug: "cue",
  filePath: "runtime/media/background-music/cue"
};

function createEntry(id: string): RuntimeDialogueEntry {
  return {
    id,
    orderIndex: 1,
    text: "Line.",
    speaker: {
      type: "narrator"
    },
    stage: {
      left: null,
      right: null
    }
  };
}

function createScene(input: {
  id: string;
  backgroundMusicCues?: RuntimeScene["backgroundMusicCues"];
}): RuntimeScene {
  return {
    id: input.id,
    title: input.id,
    orderIndex: 1,
    backgroundImage: null,
    backgroundMusic: sharedMusic,
    backgroundMusicCues: input.backgroundMusicCues ?? [],
    carryOcnoerDressSelection: true,
    characterPool: [],
    dialogue: [
      createEntry(`${input.id}_dialogue_1`),
      createEntry(`${input.id}_dialogue_2`)
    ]
  };
}

function createBundle(): RuntimeChapterBundle {
  return {
    schemaVersion: 1,
    generatedAt: "2026-04-25T00:00:00.000Z",
    nextChapterId: null,
    chapter: {
      id: "chapter_one",
      title: "Chapter One",
      slug: "chapter-one",
      orderIndex: 1,
      openingCardText: null,
      endingCardText: null,
      endingCardBackgroundMusic: null,
      scenes: [
        createScene({
          id: "scene_one",
          backgroundMusicCues: [
            {
              afterDialogueEntryId: "scene_one_dialogue_1",
              backgroundMusic: cueMusic
            }
          ]
        }),
        createScene({
          id: "scene_two"
        })
      ]
    }
  };
}

function getPlayableKey(
  cue: ReturnType<typeof resolveNativeReaderBackgroundMusicCue>
) {
  expect(cue.status).toBe("playable");

  return cue.status === "playable" ? cue.key : "";
}

describe("resolveNativeReaderBackgroundMusicCue", () => {
  it("uses scene identity in the playback key even when scenes share a track", () => {
    const bundle = createBundle();
    const sceneOneKey = getPlayableKey(
      resolveNativeReaderBackgroundMusicCue({
        supabaseUrl,
        bundle,
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 0,
          isChapterComplete: false
        },
        boundaryState: null
      })
    );
    const sceneTwoKey = getPlayableKey(
      resolveNativeReaderBackgroundMusicCue({
        supabaseUrl,
        bundle,
        readerState: {
          sceneIndex: 1,
          dialogueIndex: 0,
          isChapterComplete: false
        },
        boundaryState: null
      })
    );

    expect(sceneOneKey).toContain("scene=scene_one");
    expect(sceneTwoKey).toContain("scene=scene_two");
    expect(sceneOneKey).not.toBe(sceneTwoKey);
  });

  it("keeps the scene default key stable while dialogue advances", () => {
    const bundle = createBundle();
    const firstLineKey = getPlayableKey(
      resolveNativeReaderBackgroundMusicCue({
        supabaseUrl,
        bundle,
        readerState: {
          sceneIndex: 1,
          dialogueIndex: 0,
          isChapterComplete: false
        },
        boundaryState: null
      })
    );
    const secondLineKey = getPlayableKey(
      resolveNativeReaderBackgroundMusicCue({
        supabaseUrl,
        bundle,
        readerState: {
          sceneIndex: 1,
          dialogueIndex: 1,
          isChapterComplete: false
        },
        boundaryState: null
      })
    );

    expect(secondLineKey).toBe(firstLineKey);
  });

  it("uses the cue trigger identity when an in-scene music cue is active", () => {
    const key = getPlayableKey(
      resolveNativeReaderBackgroundMusicCue({
        supabaseUrl,
        bundle: createBundle(),
        readerState: {
          sceneIndex: 0,
          dialogueIndex: 1,
          isChapterComplete: false
        },
        boundaryState: null
      })
    );

    expect(key).toContain("scene=scene_one");
    expect(key).toContain("cue=scene_one_dialogue_1");
    expect(key).toContain("track=music_cue");
  });
});
