import { describe, expect, it } from "vitest";

import type { RuntimeDialogueEntry } from "@/lib/story/types";

import {
  DEFAULT_LINE_EXIT_DURATION_MS,
  TYPING_BASE_DELAY_MS,
  TYPING_COMMA_EXTRA_DELAY_MS,
  TYPING_SENTENCE_EXTRA_DELAY_MS,
  getDialogueCardPlacement,
  getLineEnterDelayMs,
  getLineMotionConfig,
  getTypingCharacterDelayMs,
  getTypingDurationMs
} from "./player-story-reader-motion";

function createNarratorEntry(): RuntimeDialogueEntry {
  return {
    id: "narrator_line",
    orderIndex: 1,
    text: "Narrator line.",
    speaker: {
      type: "narrator"
    },
    stage: {
      left: null,
      right: null
    }
  };
}

function createCharacterEntry(input: {
  id: string;
  side: "left" | "right" | "center";
}): RuntimeDialogueEntry {
  const speaker = {
    type: "character" as const,
    characterId: "character_alpha",
    characterName: "Alpha",
    characterSlug: "alpha",
    emotionKey: "default",
    emotionLabel: "Default",
    emotionImagePath: "runtime/media/alpha.png"
  };

  return {
    id: input.id,
    orderIndex: 1,
    text: "Character line.",
    speaker,
    stage: {
      left:
        input.side === "left"
          ? {
              characterId: speaker.characterId,
              characterName: speaker.characterName,
              characterSlug: speaker.characterSlug,
              emotionKey: speaker.emotionKey,
              emotionLabel: speaker.emotionLabel,
              imagePath: speaker.emotionImagePath
            }
          : null,
      right:
        input.side === "right"
          ? {
              characterId: speaker.characterId,
              characterName: speaker.characterName,
              characterSlug: speaker.characterSlug,
              emotionKey: speaker.emotionKey,
              emotionLabel: speaker.emotionLabel,
              imagePath: speaker.emotionImagePath
            }
          : null
    }
  };
}

describe("player story reader motion helpers", () => {
  it("maps dialogue placement from the speaking side", () => {
    expect(
      getDialogueCardPlacement(
        createCharacterEntry({ id: "left", side: "left" })
      )
    ).toBe("speaker-left");
    expect(
      getDialogueCardPlacement(
        createCharacterEntry({ id: "right", side: "right" })
      )
    ).toBe("speaker-right");
    expect(
      getDialogueCardPlacement(
        createCharacterEntry({ id: "center", side: "center" })
      )
    ).toBe("center");
    expect(getDialogueCardPlacement(createNarratorEntry())).toBe("center");
  });

  it("selects mirrored card and portrait directions for character and narrator lines", () => {
    expect(
      getLineMotionConfig(createCharacterEntry({ id: "left", side: "left" }))
    ).toEqual({
      placement: "speaker-left",
      cardDirection: "from-right",
      portraits: {
        left: true,
        right: false
      }
    });

    expect(
      getLineMotionConfig(createCharacterEntry({ id: "right", side: "right" }))
    ).toEqual({
      placement: "speaker-right",
      cardDirection: "from-left",
      portraits: {
        left: false,
        right: true
      }
    });

    expect(getLineMotionConfig(createNarratorEntry())).toEqual({
      placement: "center",
      cardDirection: "from-bottom",
      portraits: {
        left: false,
        right: false
      }
    });
  });

  it("delays narrator entrance long enough for prior portraits to leave", () => {
    expect(
      getLineEnterDelayMs({
        currentEntry: createNarratorEntry(),
        previousEntry: createCharacterEntry({ id: "left", side: "left" }),
        reducedMotion: false
      })
    ).toBe(DEFAULT_LINE_EXIT_DURATION_MS);

    expect(
      getLineEnterDelayMs({
        currentEntry: createNarratorEntry(),
        previousEntry: createNarratorEntry(),
        reducedMotion: false
      })
    ).toBe(0);

    expect(
      getLineEnterDelayMs({
        currentEntry: createNarratorEntry(),
        previousEntry: createCharacterEntry({ id: "left", side: "left" }),
        reducedMotion: true
      })
    ).toBe(0);
  });

  it("applies brisk typing timing with punctuation pauses after they appear", () => {
    expect(getTypingCharacterDelayMs("A")).toBe(TYPING_BASE_DELAY_MS);
    expect(getTypingCharacterDelayMs(",")).toBe(
      TYPING_BASE_DELAY_MS + TYPING_COMMA_EXTRA_DELAY_MS
    );
    expect(getTypingCharacterDelayMs("!")).toBe(
      TYPING_BASE_DELAY_MS + TYPING_SENTENCE_EXTRA_DELAY_MS
    );
    expect(
      getTypingDurationMs({
        text: "Hi,."
      })
    ).toBe(TYPING_BASE_DELAY_MS * 4 + TYPING_COMMA_EXTRA_DELAY_MS);
    expect(
      getTypingDurationMs({
        text: "Hi!"
      })
    ).toBe(TYPING_BASE_DELAY_MS * 3);
    expect(
      getTypingDurationMs({
        text: "Hi,.",
        reducedMotion: true
      })
    ).toBe(0);
  });
});
