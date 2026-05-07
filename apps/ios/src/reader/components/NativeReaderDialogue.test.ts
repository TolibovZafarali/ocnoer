import { describe, expect, it } from "vitest";

import {
  NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS,
  NATIVE_READER_CHAPTER_CARD_TEXT_APPEAR_DELAY_MS,
  NATIVE_READER_CHARS_PER_SECOND,
  NATIVE_READER_CHAPTER_CARD_MUSIC_AFTER_TEXT_DELAY_MS,
  NATIVE_READER_TYPING_BASE_DELAY_MS,
  createNativeReaderChapterCardRevealPlan,
  createNativeReaderDialogueAnimationKey,
  getNativeReaderChapterCardVisibleTextLengthAtElapsedMs,
  getNativeReaderMaxTextStateUpdatesForDurationMs,
  getNativeReaderTextUpdateCadenceMs,
  getNativeReaderTypingExpectedDurationMs,
  getNativeReaderVisibleTextLengthAtElapsedMs,
  shouldApplyNativeReaderForceCompleteRequest,
  shouldDeferNativeReaderTextReveal,
  shouldStartDeferredNativeReaderTextReveal
} from "../nativeReaderDialogueMotion";
import {
  NATIVE_READER_DRESS_PREVIEW_FALLBACK_BACKGROUND,
  NATIVE_READER_DRESS_PREVIEW_LOADING_OVERLAY_BACKGROUND
} from "../nativeReaderStageStyle";

describe("NativeReaderDialogue motion", () => {
  it("uses a relaxed iOS typewriter cadence", () => {
    expect(NATIVE_READER_TYPING_BASE_DELAY_MS).toBe(30);
    expect(NATIVE_READER_CHARS_PER_SECOND).toBe(33);
  });

  it("uses delayed ending-card text and post-reveal music timing", () => {
    expect(NATIVE_READER_CHAPTER_CARD_TEXT_APPEAR_DELAY_MS).toBe(3000);
    expect(NATIVE_READER_CHAPTER_CARD_MUSIC_AFTER_TEXT_DELAY_MS).toBe(2000);
  });

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

  it("keeps dress preview fallback visible inside the dress prompt", () => {
    expect(NATIVE_READER_DRESS_PREVIEW_FALLBACK_BACKGROUND).toBe(
      "rgba(255, 255, 255, 0.04)"
    );
    expect(NATIVE_READER_DRESS_PREVIEW_LOADING_OVERLAY_BACKGROUND).toBe(
      "rgba(0, 0, 0, 0.18)"
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

  it("caps text reveal updates below one React state update per character", () => {
    const characters = Array.from("A".repeat(300));
    const expectedDurationMs = getNativeReaderTypingExpectedDurationMs({
      characters,
      initialDelayMs: 0
    });
    const maxUpdates = getNativeReaderMaxTextStateUpdatesForDurationMs({
      durationMs: expectedDurationMs,
      maxTextUpdatesPerSecond: 30
    });

    expect(getNativeReaderTextUpdateCadenceMs(30)).toBeGreaterThanOrEqual(33);
    expect(maxUpdates).toBeLessThan(characters.length);
  });

  it("does not reuse a tap-to-complete request for the next dialogue card", () => {
    const request = {
      requestId: 1,
      typingKey: "supported:line_one:First line."
    };

    expect(
      shouldApplyNativeReaderForceCompleteRequest({
        isTextComplete: false,
        request,
        typingKey: "supported:line_one:First line."
      })
    ).toBe(true);
    expect(
      shouldApplyNativeReaderForceCompleteRequest({
        isTextComplete: false,
        request,
        typingKey: "supported:line_two:Second line."
      })
    ).toBe(false);
  });

  it("defers text reveal until a transition-held card can enter", () => {
    const typingKey = "supported:line_after_transition:First line.";

    expect(
      shouldDeferNativeReaderTextReveal({
        characterCount: Array.from("First line.").length,
        isExiting: true
      })
    ).toBe(true);
    expect(
      shouldStartDeferredNativeReaderTextReveal({
        deferredTypingKey: typingKey,
        isExiting: true,
        typingKey
      })
    ).toBe(false);
    expect(
      shouldStartDeferredNativeReaderTextReveal({
        deferredTypingKey: typingKey,
        isExiting: false,
        typingKey
      })
    ).toBe(true);
  });

  it("treats chapter-card hash markers as invisible pauses", () => {
    const plan = createNativeReaderChapterCardRevealPlan({
      text: "Before#After",
      enablePauseMarker: true
    });
    const beforeCharacters = Array.from("Before");
    const beforeDurationMs = getNativeReaderTypingExpectedDurationMs({
      characters: beforeCharacters,
      initialDelayMs: 0
    });

    expect(plan.displayText).toBe("BeforeAfter");
    expect(plan.displayCharacters).toEqual(Array.from("BeforeAfter"));
    expect(plan.pauseDurationsMs).toEqual([
      NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS,
      0
    ]);

    expect(
      getNativeReaderChapterCardVisibleTextLengthAtElapsedMs({
        elapsedMs:
          beforeDurationMs + NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS / 2,
        plan
      })
    ).toBe(beforeCharacters.length);
    expect(
      getNativeReaderChapterCardVisibleTextLengthAtElapsedMs({
        elapsedMs:
          beforeDurationMs + NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS + 30,
        plan
      })
    ).toBe(beforeCharacters.length + 1);
  });
});
