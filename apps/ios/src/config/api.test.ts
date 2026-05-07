import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {
    SourceCode: {
      scriptURL: "http://localhost:8081/index.bundle?platform=ios"
    }
  }
}));

import { getMobileApiConfig } from "./api";

describe("getMobileApiConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the statically referenced public API base URL", () => {
    vi.stubEnv(
      "EXPO_PUBLIC_OCNOER_API_BASE_URL",
      "https://ocnoer.vercel.app/"
    );

    expect(getMobileApiConfig()).toEqual({
      baseUrl: "https://ocnoer.vercel.app"
    });
  });
});
