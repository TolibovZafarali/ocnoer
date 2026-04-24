import type { RuntimeDialogueEntry } from "@ocnoer/story-core";

export const DEFAULT_LINE_ENTER_DURATION_MS = 300;
export const DEFAULT_LINE_EXIT_DURATION_MS = 240;
export const DEFAULT_LINE_TRAVEL_PX = 48;
export const REDUCED_MOTION_DURATION_MS = 140;
export const CONTINUE_BUTTON_ENTER_DURATION_MS = 180;
export const TYPING_BASE_DELAY_MS = 22;
export const TYPING_COMMA_EXTRA_DELAY_MS = 42;
export const TYPING_SENTENCE_EXTRA_DELAY_MS = 110;
export const CHAPTER_CARD_PAUSE_MARKER = "#";
export const CHAPTER_CARD_PAUSE_DURATION_MS = 1250;

export type PresentationPhase = "entering" | "typing" | "ready" | "exiting";

export type DialogueCardPlacement = "speaker-left" | "speaker-right" | "center";

export type MotionDirection = "from-left" | "from-right" | "from-bottom";

export type LineMotionConfig = {
  placement: DialogueCardPlacement;
  cardDirection: MotionDirection;
  portraits: {
    left: boolean;
    right: boolean;
  };
};

export type ChapterCardRevealPlan = {
  displayText: string;
  totalDurationMs: number;
  totalVisibleCharacterCount: number;
  segmentCharacterCounts: number[];
  segmentTypingDurationsMs: number[];
  pauseDurationsMs: number[];
};

export function getDialogueCardPlacement(
  entry: RuntimeDialogueEntry
): DialogueCardPlacement {
  if (entry.speaker.type !== "character") {
    return "center";
  }

  if (entry.stage.left?.characterId === entry.speaker.characterId) {
    return "speaker-left";
  }

  if (entry.stage.right?.characterId === entry.speaker.characterId) {
    return "speaker-right";
  }

  return "center";
}

export function getLineMotionConfig(
  entry: RuntimeDialogueEntry
): LineMotionConfig {
  const placement = getDialogueCardPlacement(entry);

  if (entry.speaker.type !== "character") {
    return {
      placement,
      cardDirection: "from-bottom",
      portraits: {
        left: false,
        right: false
      }
    };
  }

  if (placement === "speaker-left") {
    return {
      placement,
      cardDirection: "from-right",
      portraits: {
        left: true,
        right: false
      }
    };
  }

  if (placement === "speaker-right") {
    return {
      placement,
      cardDirection: "from-left",
      portraits: {
        left: false,
        right: true
      }
    };
  }

  return {
    placement,
    cardDirection: "from-bottom",
    portraits: {
      left: false,
      right: false
    }
  };
}

export function getLineEnterDelayMs(input: {
  currentEntry: RuntimeDialogueEntry;
  previousEntry: RuntimeDialogueEntry | null;
  reducedMotion: boolean;
}) {
  if (input.reducedMotion || !input.previousEntry) {
    return 0;
  }

  const currentMotion = getLineMotionConfig(input.currentEntry);
  const previousMotion = getLineMotionConfig(input.previousEntry);

  if (
    currentMotion.cardDirection === "from-bottom" &&
    (previousMotion.portraits.left || previousMotion.portraits.right)
  ) {
    return DEFAULT_LINE_EXIT_DURATION_MS;
  }

  return 0;
}

export function getMotionOffset(input: {
  direction: MotionDirection;
  reducedMotion: boolean;
  travelPx?: number;
}) {
  const travelPx = input.reducedMotion
    ? 0
    : (input.travelPx ?? DEFAULT_LINE_TRAVEL_PX);

  if (input.direction === "from-left") {
    return { x: -travelPx, y: 0 };
  }

  if (input.direction === "from-right") {
    return { x: travelPx, y: 0 };
  }

  return { x: 0, y: travelPx };
}

export function getTypingCharacterDelayMs(character: string) {
  if (/[.!?]/.test(character)) {
    return TYPING_BASE_DELAY_MS + TYPING_SENTENCE_EXTRA_DELAY_MS;
  }

  if (character === ",") {
    return TYPING_BASE_DELAY_MS + TYPING_COMMA_EXTRA_DELAY_MS;
  }

  return TYPING_BASE_DELAY_MS;
}

export function getTypingDurationMs(input: {
  text: string;
  reducedMotion?: boolean;
}) {
  if (input.reducedMotion) {
    return 0;
  }

  const characters = Array.from(input.text);

  return characters.reduce((total, character, index) => {
    if (index === 0) {
      return total + TYPING_BASE_DELAY_MS;
    }

    return (
      total + getTypingCharacterDelayMs(characters[index - 1] ?? character)
    );
  }, 0);
}

export function createChapterCardRevealPlan(input: {
  text: string;
  reducedMotion?: boolean;
  enablePauseMarker?: boolean;
  minimumTypingDurationMs?: number;
  typingDurationMultiplier?: number;
  pauseDurationMs?: number;
}): ChapterCardRevealPlan {
  const segments = input.enablePauseMarker
    ? input.text.split(CHAPTER_CARD_PAUSE_MARKER)
    : [input.text];
  const displayText = segments.join("");
  const segmentCharacterCounts = segments.map(
    (segment) => Array.from(segment).length
  );
  const totalVisibleCharacterCount = segmentCharacterCounts.reduce(
    (sum, count) => sum + count,
    0
  );

  if (input.reducedMotion || totalVisibleCharacterCount === 0) {
    return {
      displayText,
      totalDurationMs: 0,
      totalVisibleCharacterCount,
      segmentCharacterCounts,
      segmentTypingDurationsMs: segmentCharacterCounts.map(() => 0),
      pauseDurationsMs: segmentCharacterCounts.map(() => 0)
    };
  }

  const rawSegmentTypingDurationsMs = segments.map((segment) =>
    getTypingDurationMs({ text: segment })
  );
  const rawTypingDurationMs = rawSegmentTypingDurationsMs.reduce(
    (sum, durationMs) => sum + durationMs,
    0
  );
  const typingDurationMs =
    Math.max(input.minimumTypingDurationMs ?? 0, rawTypingDurationMs) *
    (input.typingDurationMultiplier ?? 1);
  const segmentTypingDurationsMs =
    rawTypingDurationMs > 0
      ? rawSegmentTypingDurationsMs.map(
          (durationMs) => (durationMs / rawTypingDurationMs) * typingDurationMs
        )
      : segmentCharacterCounts.map(
          (characterCount) =>
            (characterCount / totalVisibleCharacterCount) * typingDurationMs
        );
  const pauseDurationMs =
    input.pauseDurationMs ?? CHAPTER_CARD_PAUSE_DURATION_MS;
  const pauseDurationsMs = segmentCharacterCounts.map((_, segmentIndex) => {
    if (segmentIndex === segmentCharacterCounts.length - 1) {
      return 0;
    }

    const remainingCharacterCount = segmentCharacterCounts
      .slice(segmentIndex + 1)
      .reduce((sum, count) => sum + count, 0);

    return remainingCharacterCount > 0 ? pauseDurationMs : 0;
  });

  return {
    displayText,
    totalDurationMs:
      segmentTypingDurationsMs.reduce(
        (sum, durationMs) => sum + durationMs,
        0
      ) + pauseDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0),
    totalVisibleCharacterCount,
    segmentCharacterCounts,
    segmentTypingDurationsMs,
    pauseDurationsMs
  };
}

export function getChapterCardRevealProgress(input: {
  elapsedMs: number;
  plan: ChapterCardRevealPlan;
}) {
  if (
    input.plan.totalDurationMs <= 0 ||
    input.plan.totalVisibleCharacterCount === 0
  ) {
    return 1;
  }

  let remainingElapsedMs = Math.max(0, input.elapsedMs);
  let revealedCharacterCount = 0;

  for (
    let segmentIndex = 0;
    segmentIndex < input.plan.segmentCharacterCounts.length;
    segmentIndex += 1
  ) {
    const segmentCharacterCount =
      input.plan.segmentCharacterCounts[segmentIndex] ?? 0;
    const segmentTypingDurationMs =
      input.plan.segmentTypingDurationsMs[segmentIndex] ?? 0;

    if (
      segmentTypingDurationMs > 0 &&
      remainingElapsedMs < segmentTypingDurationMs
    ) {
      return Math.min(
        1,
        (revealedCharacterCount +
          (remainingElapsedMs / segmentTypingDurationMs) *
            segmentCharacterCount) /
          input.plan.totalVisibleCharacterCount
      );
    }

    remainingElapsedMs -= segmentTypingDurationMs;
    revealedCharacterCount += segmentCharacterCount;

    const pauseDurationMs = input.plan.pauseDurationsMs[segmentIndex] ?? 0;

    if (pauseDurationMs > 0 && remainingElapsedMs < pauseDurationMs) {
      return revealedCharacterCount / input.plan.totalVisibleCharacterCount;
    }

    remainingElapsedMs -= pauseDurationMs;
  }

  return 1;
}
