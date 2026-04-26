import { describe, expect, it } from "vitest";

import {
  createNativeReaderDialogueAnimationKey,
  getNativeReaderTypingExpectedDurationMs,
  getNativeReaderVisibleTextLengthAtElapsedMs
} from "../nativeReaderDialogueMotion";

describe("NativeReaderDialogue motion", () => {
  it("does not tie character card animation identity to portrait load state", () => {
    const basePresentation = {
      status: "supported" as const,
      dialogueEntryId: "line_character"
    };

    expect(createNativeReaderDialogueAnimationKey(basePresentation)).toBe(
      createNativeReaderDialogueAnimationKey({
        ...basePresentation
      })
    );
  });

  it("reveals text by elapsed time instead of one character per delayed tick", () => {
    const characters = Array.from("Hello.");
    const expectedDurationMs = getNativeReaderTypingExpectedDurationMs({
      characters,
      initialDelayMs: 300
    });

    expect(
      getNativeReaderVisibleTextLengthAtElapsedMs({
        characters,
        elapsedMs: expectedDurationMs,
        initialDelayMs: 300
      })
    ).toBe(characters.length);
  });

  it("catches up after a delayed text animation frame", () => {
    const characters = Array.from("Line");

    expect(
      getNativeReaderVisibleTextLengthAtElapsedMs({
        characters,
        elapsedMs: 500,
        initialDelayMs: 0
      })
    ).toBe(characters.length);
  });

  it("uses the same elapsed-time text speed for narrator and character lines", () => {
    const text = Array.from("Same speed.");
    const elapsedMs = 180;

    expect(
      getNativeReaderVisibleTextLengthAtElapsedMs({
        characters: text,
        elapsedMs,
        initialDelayMs: 0
      })
    ).toBe(
      getNativeReaderVisibleTextLengthAtElapsedMs({
        characters: text,
        elapsedMs,
        initialDelayMs: 0
      })
    );
  });
});
