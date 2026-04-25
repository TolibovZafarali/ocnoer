import { describe, expect, it } from "vitest";

import {
  NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
  NATIVE_READER_TRANSPARENT_PORTRAIT_STYLE
} from "../nativeReaderStageStyle";

describe("NativeReaderStage portrait styling", () => {
  it("keeps portrait wrapper backgrounds transparent", () => {
    expect(NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND).toBe("transparent");
    expect(NATIVE_READER_TRANSPARENT_PORTRAIT_STYLE).toEqual({
      backgroundColor: "transparent"
    });
  });
});
