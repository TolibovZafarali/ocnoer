import { describe, expect, it } from "vitest";

import {
  findSceneBackgroundMusicById,
  resolveSceneBackgroundMusicTrackId
} from "@/app/(player)/play/player-story-reader-background-music";
import type { RuntimeScene } from "@ocnoer/story-core";

const scene: RuntimeScene = {
  id: "scene_1",
  title: "Scene One",
  orderIndex: 1,
  backgroundImage: null,
  backgroundMusic: {
    id: "music_theme",
    label: "Theme",
    slug: "theme",
    filePath: "runtime/media/theme.mp3"
  },
  backgroundMusicCues: [
    {
      afterDialogueEntryId: "dialogue_1",
      backgroundMusic: {
        id: "music_alt",
        label: "Alt",
        slug: "alt",
        filePath: "runtime/media/alt.mp3"
      }
    },
    {
      afterDialogueEntryId: "dialogue_2",
      backgroundMusic: null
    }
  ],
  carryOcnoerDressSelection: true,
  characterPool: [],
  dialogue: [
    {
      id: "dialogue_1",
      orderIndex: 1,
      text: "First",
      speaker: {
        type: "narrator"
      },
      stage: {
        left: null,
        right: null
      }
    },
    {
      id: "dialogue_2",
      orderIndex: 2,
      text: "Second",
      speaker: {
        type: "narrator"
      },
      stage: {
        left: null,
        right: null
      }
    },
    {
      id: "dialogue_3",
      orderIndex: 3,
      text: "Third",
      speaker: {
        type: "narrator"
      },
      stage: {
        left: null,
        right: null
      }
    }
  ]
};

describe("player story reader background music helpers", () => {
  it("keeps the base track until the trigger dialogue has passed", () => {
    expect(
      resolveSceneBackgroundMusicTrackId({
        scene,
        dialogueIndex: 0
      })
    ).toBe("music_theme");
    expect(
      resolveSceneBackgroundMusicTrackId({
        scene,
        dialogueIndex: 1
      })
    ).toBe("music_alt");
  });

  it("lets a later cue fade the scene to silence", () => {
    expect(
      resolveSceneBackgroundMusicTrackId({
        scene,
        dialogueIndex: 2
      })
    ).toBeNull();
  });

  it("finds the active track object by id", () => {
    expect(findSceneBackgroundMusicById(scene, "music_theme")?.filePath).toBe(
      "runtime/media/theme.mp3"
    );
    expect(findSceneBackgroundMusicById(scene, "music_alt")?.filePath).toBe(
      "runtime/media/alt.mp3"
    );
    expect(findSceneBackgroundMusicById(scene, null)).toBeNull();
  });
});
