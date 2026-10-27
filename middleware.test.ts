import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, middleware } from "./middleware";
import nextConfig from "./next.config";

const disabledPaths = [
  "/",
  "/?chapter=old-chapter",
  "/play",
  "/play/",
  "/admin",
  "/admin/login",
  "/admin/chapters/chapter/scenes/scene",
  "/sign-in",
  "/privacy",
  "/support",
  "/api",
  "/api/player/progress",
  "/api/mobile/player/session",
  "/api/player/cat-name",
  "/_next/static/chunks/main.js",
  "/_next/image?url=%2Ficon.png&w=640&q=75",
  "/_next/data/build-id/index.json",
  "/_next/data/build-id/play.json",
  "/icon.png",
  "/favicon.ico",
  "/nebula.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/unknown/page",
  "/story.json",
  "/%61dmin",
  "/api%2Fplayer%2Fprogress"
];

const internalHeaders: Record<string, string>[] = [
  { rsc: "1", "next-router-prefetch": "1" },
  { "next-action": "previous-action-id" },
  { "x-nextjs-data": "1" },
  {
    "x-middleware-subrequest":
      "middleware:middleware:middleware:middleware:middleware"
  }
];

describe("deactivated website", () => {
  it.each(disabledPaths)(
    "matches %s without an asset or route exception",
    (path) => {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig,
          url: `https://example.com${path}`
        })
      ).toBe(true);
    }
  );

  it("returns an empty uncached 410 without forwarding to an application handler", async () => {
    const response = middleware();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive"
    );
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it.each(internalHeaders)(
    "does not exempt internal-looking request headers: %j",
    (headers) => {
      const request = new NextRequest("https://example.com/play", { headers });

      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig,
          url: request.url,
          headers
        })
      ).toBe(true);
      expect(middleware().status).toBe(410);
    }
  );

  it("allows the shutdown response to handle slash and data URLs directly", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
    expect(nextConfig.skipMiddlewareUrlNormalize).toBe(true);
  });
});
