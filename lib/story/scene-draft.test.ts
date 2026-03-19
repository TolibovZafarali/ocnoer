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
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_1",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          text: "Narration"
        },
        {
          id: "dialogue_2",
          speakerType: "character",
          characterId: "character_1",
          emotionKey: "neutral",
          text: "Character line"
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
          characterIds: ["character_1"]
        },
        dialogue: [
          {
            id: "dialogue_1",
            speakerType: "narrator",
            characterId: null,
            emotionKey: null,
            text: ""
          }
        ]
      })
    ).toEqual({
      scene: {
        title: "Scene One",
        orderIndex: 1,
        backgroundImageAssetId: "bg_1",
        backgroundMusicAssetId: null,
        characterIds: ["character_1"]
      },
      dialogue: [
        {
          id: "dialogue_1",
          speakerType: "narrator",
          characterId: null,
          emotionKey: null,
          text: ""
        }
      ]
    });

    expect(
      parseSceneDraftPayload({
        scene: {
          title: "Scene One",
          orderIndex: 1,
          backgroundImageAssetId: "bg_1",
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

  it("identifies temp dialogue ids", () => {
    expect(isSceneDraftTempId("draft:abc")).toBe(true);
    expect(isSceneDraftTempId("dialogue_1")).toBe(false);
  });
});
