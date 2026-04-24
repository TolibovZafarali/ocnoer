import { describe, expect, it } from "vitest";

import {
  createSceneDraftPayload,
  isSceneDraftTempId,
  parseSceneDraftPayload
} from "@/lib/story/scene-draft";

describe("scene draft helpers", () => {
  it("creates a draft payload from a scene definition", () => {
    const payload = createSceneDraftPayload({
      id: "scene_1",
      title: "Scene One",
      orderIndex: 1,
      backgroundImageAssetId: "bg_1",
      backgroundMusicAssetId: null,
      backgroundMusicCues: [],
      carryOcnoerDressSelection: true,
      characterIds: ["character_1"],
      dialogue: [
        {
          id: "dialogue_1",
          orderIndex: 1,
          text: "Narration",
          speaker: {
            type: "narrator"
          },
          createdAt: "2026-03-19T12:00:00.000Z",
          updatedAt: "2026-03-19T12:00:00.000Z"
        },
        {
          id: "dialogue_2",
          orderIndex: 2,
          text: "Character line",
          speaker: {
            type: "character",
            characterId: "character_1",
            emotionKey: "neutral"
          },
          createdAt: "2026-03-19T12:00:00.000Z",
          updatedAt: "2026-03-19T12:00:00.000Z"
        },
        {
          id: "dialogue_3",
          orderIndex: 3,
          text: "Dress choice line",
          speaker: {
            type: "dress_prompt",
            characterId: "character_1",
            dressOptionKeys: ["base", "winter"]
          },
          createdAt: "2026-03-19T12:00:00.000Z",
          updatedAt: "2026-03-19T12:00:00.000Z"
        },
        {
          id: "dialogue_4",
          orderIndex: 4,
          text: "Name the cat",
          speaker: {
            type: "cat_name_prompt",
            characterId: "character_1"
          },
          createdAt: "2026-03-19T12:00:00.000Z",
          updatedAt: "2026-03-19T12:00:00.000Z"
        }
      ],
      createdAt: "2026-03-19T12:00:00.000Z",
      updatedAt: "2026-03-19T12:00:00.000Z"
    });

    expect(payload).toEqual({
      scene: {
        title: "Scene One",
        orderIndex: 1,
        backgroundImageAssetId: "bg_1",
        backgroundMusicAssetId: null,
        backgroundMusicCues: [],
        carryOcnoerDressSelection: true,
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_1",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          dressOptionKeys: [],
          text: "Narration"
        },
        {
          id: "dialogue_2",
          speakerType: "character",
          characterId: "character_1",
          emotionKey: "neutral",
          dressOptionKeys: [],
          text: "Character line"
        },
        {
          id: "dialogue_3",
          speakerType: "dress_prompt",
          characterId: "character_1",
          emotionKey: null,
          dressOptionKeys: ["base", "winter"],
          text: "Dress choice line"
        },
        {
          id: "dialogue_4",
          speakerType: "cat_name_prompt",
          characterId: "character_1",
          emotionKey: null,
          dressOptionKeys: [],
          text: "Name the cat"
        }
      ]
    });
  });

  it("parses valid draft payloads and rejects invalid shapes", () => {
    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene One",
          orderIndex: 1,
          backgroundImageAssetId: "bg_1",
          backgroundMusicAssetId: null,
          backgroundMusicCues: [],
          carryOcnoerDressSelection: false,
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_1",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            dressOptionKeys: [],
            text: ""
          },
          {
            id: "dialogue_2",
            speakerType: "dress_prompt",
            characterId: "character_1",
            emotionKey: null,
            dressOptionKeys: ["base"],
            text: "Dress prompt"
          },
          {
            id: "dialogue_3",
            speakerType: "cat_name_prompt",
            characterId: "character_1",
            emotionKey: null,
            dressOptionKeys: [],
            text: "Name prompt"
          }
        ]
      })
    ).toEqual({
      scene: {
        title: "Scene One",
        orderIndex: 1,
        backgroundImageAssetId: "bg_1",
        backgroundMusicAssetId: null,
        backgroundMusicCues: [],
        carryOcnoerDressSelection: false,
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_1",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          dressOptionKeys: [],
          text: ""
        },
        {
          id: "dialogue_2",
          speakerType: "dress_prompt",
          characterId: "character_1",
          emotionKey: null,
          dressOptionKeys: ["base"],
          text: "Dress prompt"
        },
        {
          id: "dialogue_3",
          speakerType: "cat_name_prompt",
          characterId: "character_1",
          emotionKey: null,
          dressOptionKeys: [],
          text: "Name prompt"
        }
      ]
    });

    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene Two",
          orderIndex: 2,
          backgroundImageAssetId: "bg_1",
          backgroundMusicAssetId: null,
          backgroundMusicCues: [],
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_3",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            dressOptionKeys: [],
            text: "Line"
          }
        ]
      })
    ).toEqual({
      scene: {
        title: "Scene Two",
        orderIndex: 2,
        backgroundImageAssetId: "bg_1",
        backgroundMusicAssetId: null,
        backgroundMusicCues: [],
        carryOcnoerDressSelection: true,
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_3",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          dressOptionKeys: [],
          text: "Line"
        }
      ]
    });

    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene Without Background",
          orderIndex: 3,
          backgroundImageAssetId: null,
          backgroundMusicAssetId: null,
          backgroundMusicCues: [],
          characterIds: []
        },
        dialogue: []
      })
    ).toEqual({
      scene: {
        title: "Scene Without Background",
        orderIndex: 3,
        backgroundImageAssetId: null,
        backgroundMusicAssetId: null,
        backgroundMusicCues: [],
        carryOcnoerDressSelection: true,
        characterIds: []
      },
      dialogue: []
    });

    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene One",
          orderIndex: 1,
          backgroundImageAssetId: "bg_1",
          carryOcnoerDressSelection: true,
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_1",
            speakerType: "narrator"
          }
        ]
      })
    ).toBeNull();
  });

  it("preserves background music cues in scene drafts", () => {
    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene With Music Cues",
          orderIndex: 4,
          backgroundImageAssetId: "bg_1",
          backgroundMusicAssetId: "music_1",
          backgroundMusicCues: [
            {
              afterDialogueEntryId: "dialogue_1",
              backgroundMusicAssetId: "music_2"
            },
            {
              afterDialogueEntryId: "dialogue_2",
              backgroundMusicAssetId: null
            }
          ],
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_1",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            dressOptionKeys: [],
            text: "Line one"
          },
          {
            id: "dialogue_2",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            dressOptionKeys: [],
            text: "Line two"
          },
          {
            id: "dialogue_3",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            dressOptionKeys: [],
            text: "Line three"
          }
        ]
      })
    ).toMatchObject({
      scene: {
        backgroundMusicAssetId: "music_1",
        backgroundMusicCues: [
          {
            afterDialogueEntryId: "dialogue_1",
            backgroundMusicAssetId: "music_2"
          },
          {
            afterDialogueEntryId: "dialogue_2",
            backgroundMusicAssetId: null
          }
        ]
      }
    });
  });

  it("identifies temp dialogue ids", () => {
    expect(isSceneDraftTempId("draft:abc")).toBe(true);
    expect(isSceneDraftTempId("dialogue_1")).toBe(false);
  });
});
