import type { NativeReaderPresentation } from "./readerPresentation";

export const NATIVE_READER_TYPING_BASE_DELAY_MS = 30;
export const NATIVE_READER_TYPING_COMMA_EXTRA_DELAY_MS = 42;
export const NATIVE_READER_TYPING_SENTENCE_EXTRA_DELAY_MS = 110;
export const NATIVE_READER_CHAPTER_CARD_TEXT_APPEAR_DELAY_MS = 3000;
export const NATIVE_READER_CHAPTER_CARD_MUSIC_AFTER_TEXT_DELAY_MS = 2000;
export const NATIVE_READER_RESTART_ACTION_DELAY_MS = 6000;
export const NATIVE_READER_CHAPTER_CARD_PAUSE_MARKER = "#";
export const NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS = 1250;
// Holds regular line commits briefly after the card exit so the cadence feels calm
// without stretching the slide/fade animation.
export const NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS = 120;
export const NATIVE_READER_MAX_TEXT_UPDATES_PER_SECOND = 30;
export const NATIVE_READER_CHARS_PER_SECOND = Math.round(
  1000 / NATIVE_READER_TYPING_BASE_DELAY_MS
);

export function createNativeReaderDialogueAnimationKey(
  presentation: Pick<NativeReaderPresentation, "dialogueEntryId" | "status">
) {
  return `${presentation.status}:${presentation.dialogueEntryId}`;
}

export type NativeReaderForceCompleteRequest = {
  requestId: number;
  typingKey: string;
};

export type NativeReaderChapterCardRevealPlan = {
  displayText: string;
  displayCharacters: string[];
  segmentCharacters: string[][];
  segmentCharacterCounts: number[];
  pauseDurationsMs: number[];
  totalDurationMs: number;
  totalVisibleCharacterCount: number;
};

export function shouldApplyNativeReaderForceCompleteRequest(input: {
  isTextComplete: boolean;
  request: NativeReaderForceCompleteRequest | null;
  typingKey: string;
}) {
  return Boolean(
    input.request &&
    input.request.typingKey === input.typingKey &&
    !input.isTextComplete
  );
}

export function shouldDeferNativeReaderTextReveal(input: {
  characterCount: number;
  isExiting: boolean;
}) {
  return input.isExiting && input.characterCount > 0;
}

export function shouldStartDeferredNativeReaderTextReveal(input: {
  deferredTypingKey: string | null;
  isExiting: boolean;
  typingKey: string;
}) {
  return !input.isExiting && input.deferredTypingKey === input.typingKey;
}

export function getNativeReaderTypingCharacterDelayMs(character: string) {
  if (/[.!?]/.test(character)) {
    return (
      NATIVE_READER_TYPING_BASE_DELAY_MS +
      NATIVE_READER_TYPING_SENTENCE_EXTRA_DELAY_MS
    );
  }

  if (character === ",") {
    return (
      NATIVE_READER_TYPING_BASE_DELAY_MS +
      NATIVE_READER_TYPING_COMMA_EXTRA_DELAY_MS
    );
  }

  return NATIVE_READER_TYPING_BASE_DELAY_MS;
}

export function getNativeReaderTextUpdateCadenceMs(
  maxTextUpdatesPerSecond = NATIVE_READER_MAX_TEXT_UPDATES_PER_SECOND
) {
  return Math.max(16, Math.ceil(1000 / maxTextUpdatesPerSecond));
}

export function getNativeReaderMaxTextStateUpdatesForDurationMs(input: {
  durationMs: number;
  maxTextUpdatesPerSecond?: number;
}) {
  const cadenceMs = getNativeReaderTextUpdateCadenceMs(
    input.maxTextUpdatesPerSecond
  );

  return Math.ceil(Math.max(0, input.durationMs) / cadenceMs) + 1;
}

export function getNativeReaderTypingExpectedDurationMs(input: {
  characters: string[];
  initialDelayMs?: number;
}) {
  if (input.characters.length === 0) {
    return 0;
  }

  return input.characters.reduce((total, character, index) => {
    if (index === 0) {
      return total + (input.initialDelayMs ?? 0);
    }

    return (
      total +
      getNativeReaderTypingCharacterDelayMs(
        input.characters[index - 1] ?? character
      )
    );
  }, NATIVE_READER_TYPING_BASE_DELAY_MS);
}

export function getNativeReaderVisibleTextLengthAtElapsedMs(input: {
  characters: string[];
  elapsedMs: number;
  initialDelayMs?: number;
}) {
  if (input.characters.length === 0) {
    return 0;
  }

  let remainingElapsedMs = Math.max(0, input.elapsedMs);
  let visibleTextLength = 0;

  for (let index = 0; index < input.characters.length; index += 1) {
    const character = input.characters[index];
    const delayMs =
      index === 0
        ? (input.initialDelayMs ?? 0) + NATIVE_READER_TYPING_BASE_DELAY_MS
        : getNativeReaderTypingCharacterDelayMs(
            input.characters[index - 1] ?? character
          );

    if (remainingElapsedMs < delayMs) {
      break;
    }

    remainingElapsedMs -= delayMs;
    visibleTextLength += 1;
  }

  return visibleTextLength;
}

function getNativeReaderTypingDurationForCharacters(input: {
  characters: string[];
}) {
  if (input.characters.length === 0) {
    return 0;
  }

  return input.characters.reduce((total, character, index) => {
    if (index === 0) {
      return total + NATIVE_READER_TYPING_BASE_DELAY_MS;
    }

    return (
      total +
      getNativeReaderTypingCharacterDelayMs(
        input.characters[index - 1] ?? character
      )
    );
  }, 0);
}

export function createNativeReaderChapterCardRevealPlan(input: {
  text: string;
  enablePauseMarker?: boolean;
  pauseDurationMs?: number;
}): NativeReaderChapterCardRevealPlan {
  const segmentTexts = input.enablePauseMarker
    ? input.text.split(NATIVE_READER_CHAPTER_CARD_PAUSE_MARKER)
    : [input.text];
  const segmentCharacters = segmentTexts.map((segment) => Array.from(segment));
  const segmentCharacterCounts = segmentCharacters.map(
    (characters) => characters.length
  );
  const displayCharacters = segmentCharacters.flat();
  const totalVisibleCharacterCount = displayCharacters.length;
  const pauseDurationMs =
    input.pauseDurationMs ?? NATIVE_READER_CHAPTER_CARD_PAUSE_DURATION_MS;
  const pauseDurationsMs = segmentCharacterCounts.map((_, segmentIndex) => {
    if (segmentIndex >= segmentCharacterCounts.length - 1) {
      return 0;
    }

    const remainingCharacterCount = segmentCharacterCounts
      .slice(segmentIndex + 1)
      .reduce((sum, count) => sum + count, 0);

    return remainingCharacterCount > 0 ? pauseDurationMs : 0;
  });
  const typingDurationMs = segmentCharacters.reduce(
    (total, characters) =>
      total + getNativeReaderTypingDurationForCharacters({ characters }),
    0
  );

  return {
    displayText: displayCharacters.join(""),
    displayCharacters,
    segmentCharacters,
    segmentCharacterCounts,
    pauseDurationsMs,
    totalDurationMs:
      typingDurationMs +
      pauseDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0),
    totalVisibleCharacterCount
  };
}

export function getNativeReaderChapterCardVisibleTextLengthAtElapsedMs(input: {
  elapsedMs: number;
  plan: NativeReaderChapterCardRevealPlan;
}) {
  if (input.plan.totalVisibleCharacterCount === 0) {
    return 0;
  }

  let remainingElapsedMs = Math.max(0, input.elapsedMs);
  let visibleTextLength = 0;

  for (
    let segmentIndex = 0;
    segmentIndex < input.plan.segmentCharacters.length;
    segmentIndex += 1
  ) {
    const characters = input.plan.segmentCharacters[segmentIndex] ?? [];

    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index];
      const delayMs =
        index === 0
          ? NATIVE_READER_TYPING_BASE_DELAY_MS
          : getNativeReaderTypingCharacterDelayMs(
              characters[index - 1] ?? character
            );

      if (remainingElapsedMs < delayMs) {
        return visibleTextLength;
      }

      remainingElapsedMs -= delayMs;
      visibleTextLength += 1;
    }

    const pauseDurationMs = input.plan.pauseDurationsMs[segmentIndex] ?? 0;

    if (remainingElapsedMs < pauseDurationMs) {
      return visibleTextLength;
    }

    remainingElapsedMs -= pauseDurationMs;
  }

  return input.plan.totalVisibleCharacterCount;
}
