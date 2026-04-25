import { describe, expect, it } from "vitest";

import { createNativeReaderDialogueAnimationKey } from "../nativeReaderDialogueMotion";

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
});
