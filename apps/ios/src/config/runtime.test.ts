import { afterEach, describe, expect, it, vi } from "vitest";

import { getMobileRuntimeConfig } from "./runtime";

describe("getMobileRuntimeConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the statically referenced public runtime values", () => {
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", "remote");
    vi.stubEnv(
      "EXPO_PUBLIC_OCNOER_SUPABASE_URL",
      "https://hkngkchhdpwrjwoqpjpw.supabase.co/"
    );
    vi.stubEnv(
      "EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH",
      "runtime/runtime/manifest.json"
    );

    expect(getMobileRuntimeConfig()).toEqual({
      supabaseUrl: "https://hkngkchhdpwrjwoqpjpw.supabase.co",
      manifestPath: "runtime/runtime/manifest.json"
    });
  });

  it("uses the bundled runtime without requiring remote credentials by default", () => {
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", "");
    vi.stubEnv("EXPO_PUBLIC_OCNOER_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH", "");
    expect(getMobileRuntimeConfig()).toEqual({
      supabaseUrl: "ocnoer-bundle://",
      manifestPath: "runtime/runtime/manifest.json"
    });
  });
});
