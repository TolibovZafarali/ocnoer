import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NATIVE_READER_CHARACTER_PORTRAIT_EMPTY_STYLE,
  NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
  NATIVE_READER_TRANSPARENT_PORTRAIT_STYLE
} from "../nativeReaderStageStyle";

describe("NativeReaderStage portrait styling", () => {
  it("keeps portrait wrapper backgrounds transparent", () => {
    expect(NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND).toBe("transparent");
    expect(NATIVE_READER_TRANSPARENT_PORTRAIT_STYLE).toEqual({
      backgroundColor: "transparent"
    });
    expect(NATIVE_READER_CHARACTER_PORTRAIT_EMPTY_STYLE).toEqual({
      backgroundColor: "transparent"
    });
  });

  it("does not mount a visible white fallback behind transparent portraits", () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      resolve(testDirectory, "NativeReaderStage.tsx"),
      "utf8"
    );

    expect(source).not.toContain("PortraitImageFallback");
    expect(source).not.toContain("portraitFallbackGlow");
    expect(source).not.toContain("portraitFallbackFigure");
    expect(source).not.toContain("rgba(255, 255, 255");
  });
});
