import { DialogueKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  parseIntegerField,
  validateDialogueRules,
  validateRequiredText
} from "@/lib/story/validation";

describe("validateRequiredText", () => {
  it("rejects empty text", () => {
    expect(validateRequiredText("", "Title")).toEqual({
      ok: false,
      message: "Title is required."
    });
  });

  it("accepts non-empty text", () => {
    expect(validateRequiredText("Chapter 1", "Title")).toEqual({ ok: true });
  });
});

describe("parseIntegerField", () => {
  it("parses a valid integer", () => {
    expect(parseIntegerField("12", "Order")).toEqual({
      ok: true,
      value: 12
    });
  });

  it("rejects non-integer values", () => {
    expect(parseIntegerField("a12", "Order")).toEqual({
      ok: false,
      message: "Order must be an integer."
    });
  });
});

describe("validateDialogueRules", () => {
  it("rejects player prompts with character assignment", () => {
    expect(
      validateDialogueRules({
        kind: DialogueKind.player_prompt,
        characterId: "character-1"
      })
    ).toEqual({
      ok: false,
      message: "Player prompt entries cannot have a character assignment."
    });
  });

  it("requires character assignment for speech", () => {
    expect(
      validateDialogueRules({
        kind: DialogueKind.speech,
        characterId: null
      })
    ).toEqual({
      ok: false,
      message: "Speech entries require a character assignment."
    });
  });

  it("allows thought entries without character assignment", () => {
    expect(
      validateDialogueRules({
        kind: DialogueKind.thought,
        characterId: null
      })
    ).toEqual({ ok: true });
  });
});
