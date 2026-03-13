import { DialogueKind } from "@prisma/client";

export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRequiredText(
  value: unknown,
  field: string
): ValidationResult {
  if (!isNonEmptyString(value)) {
    return {
      ok: false,
      message: `${field} is required.`
    };
  }

  return { ok: true };
}

export function parseIntegerField(
  value: unknown,
  field: string
): { ok: true; value: number } | { ok: false; message: string } {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      message: `${field} must be an integer.`
    };
  }

  return {
    ok: true,
    value: parsed
  };
}

export function validateDialogueRules(input: {
  kind: DialogueKind;
  characterId: string | null;
}): ValidationResult {
  if (input.kind === DialogueKind.player_prompt && input.characterId) {
    return {
      ok: false,
      message: "Player prompt entries cannot have a character assignment."
    };
  }

  if (input.kind === DialogueKind.speech && !input.characterId) {
    return {
      ok: false,
      message: "Speech entries require a character assignment."
    };
  }

  return { ok: true };
}
