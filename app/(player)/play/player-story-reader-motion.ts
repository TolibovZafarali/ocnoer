import type { RuntimeDialogueEntry } from "@/lib/story/types";

export const DEFAULT_LINE_ENTER_DURATION_MS = 300;
export const DEFAULT_LINE_EXIT_DURATION_MS = 240;
export const DEFAULT_LINE_TRAVEL_PX = 48;
export const REDUCED_MOTION_DURATION_MS = 140;
export const CONTINUE_BUTTON_ENTER_DURATION_MS = 180;
export const TYPING_BASE_DELAY_MS = 22;
export const TYPING_COMMA_EXTRA_DELAY_MS = 42;
export const TYPING_SENTENCE_EXTRA_DELAY_MS = 110;

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
