import { afterEach, describe, expect, it, vi } from "vitest";

import { isOfflineMode } from "./contentMode";

describe("content mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "offline", "invalid"])(
    "keeps backend access disabled for %s",
    (mode) => {
      vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", mode);
      expect(isOfflineMode()).toBe(true);
    }
  );

  it("requires an explicit remote selection", () => {
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", "remote");
    expect(isOfflineMode()).toBe(false);
  });
});
