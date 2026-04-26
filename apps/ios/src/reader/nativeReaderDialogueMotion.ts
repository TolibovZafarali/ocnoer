import type { NativeReaderPresentation } from "./readerPresentation";

export const NATIVE_READER_TYPING_BASE_DELAY_MS = 22;
export const NATIVE_READER_TYPING_COMMA_EXTRA_DELAY_MS = 42;
export const NATIVE_READER_TYPING_SENTENCE_EXTRA_DELAY_MS = 110;

export function createNativeReaderDialogueAnimationKey(
  presentation: Pick<NativeReaderPresentation, "dialogueEntryId" | "status">
) {
  return `${presentation.status}:${presentation.dialogueEntryId}`;
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
