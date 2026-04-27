import type { NativeReaderPresentation } from "./readerPresentation";

export const NATIVE_READER_TYPING_BASE_DELAY_MS = 30;
export const NATIVE_READER_TYPING_COMMA_EXTRA_DELAY_MS = 42;
export const NATIVE_READER_TYPING_SENTENCE_EXTRA_DELAY_MS = 110;
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
