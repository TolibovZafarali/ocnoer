import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {
    SourceCode: {
      scriptURL: "http://localhost:8081/index.bundle?platform=ios"
    }
  }
}));

import {
  createMobileApiClient,
  MobileApiError,
  MOBILE_API_CONNECTION_ERROR_MESSAGE
} from "./mobileApiClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

describe("createMobileApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a transient network failure before surfacing an error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = createMobileApiClient(
      {
        baseUrl: "https://ocnoer.vercel.app"
      },
      {
        fetcher,
        retryDelaysMs: [0],
        timeoutMs: 100
      }
    );

    await expect(client.requestJson<{ ok: boolean }>("/api/player/activity"))
      .resolves.toEqual({
        ok: true
      });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses production-safe copy after transient failures are exhausted", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Network request failed"));
    const client = createMobileApiClient(
      {
        baseUrl: "https://ocnoer.vercel.app"
      },
      {
        fetcher,
        retryDelaysMs: [0, 0],
        timeoutMs: 100
      }
    );

    await expect(
      client.requestJson<{ ok: boolean }>("/api/player/activity")
    ).rejects.toMatchObject({
      isTransient: true,
      message: MOBILE_API_CONNECTION_ERROR_MESSAGE,
      status: 0
    });

    await client
      .requestJson<{ ok: boolean }>("/api/player/activity")
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(MobileApiError);
        const developerBackendHint = ["Start", "the", "Next.js", "backend"].join(
          " "
        );
        const developerReachabilityHint = [
          "Unable",
          "to",
          "reach",
          "the",
          "mobile",
          "API"
        ].join(" ");

        expect(error instanceof Error ? error.message : "").not.toContain(
          developerBackendHint
        );
        expect(error instanceof Error ? error.message : "").not.toContain(
          developerReachabilityHint
        );
      });
  });

  it("does not retry or hide fatal auth errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          {
            error: "Invalid player access."
          },
          401
        )
      );
    const client = createMobileApiClient(
      {
        baseUrl: "https://ocnoer.vercel.app"
      },
      {
        fetcher,
        retryDelaysMs: [0, 0],
        timeoutMs: 100
      }
    );

    await expect(
      client.requestJson<{ ok: boolean }>("/api/mobile/player/session")
    ).rejects.toMatchObject({
      isTransient: false,
      message: "Invalid player access.",
      status: 401
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
