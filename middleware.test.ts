import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

describe("homepage-only access", () => {
  it.each([
    "/play",
    "/play?chapter=old-chapter",
    "/admin",
    "/admin/login",
    "/admin/chapters/chapter/scenes/scene",
    "/sign-in",
    "/privacy",
    "/support",
    "/unknown/page",
    "/story.json"
  ])("returns page %s to the homepage without retaining its query", (path) => {
    const response = middleware(new NextRequest(`https://example.com${path}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["/", "/_next/static/chunks/main.js", "/icon.png", "/nebula.svg"])(
    "allows the homepage and required asset %s",
    (path) => {
      const response = middleware(
        new NextRequest(`https://example.com${path}`)
      );

      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it.each([
    ["/api/player/progress", "GET"],
    ["/api/mobile/player/session", "POST"],
    ["/api", "GET"],
    ["/", "POST"],
    ["/admin/chapters", "POST"],
    ["/play", "POST"],
    ["/api/player/cat-name", "PATCH"],
    ["/api/mobile/player/session", "DELETE"]
  ])("blocks disabled endpoints and mutations: %s %s", async (path, method) => {
    const response = middleware(
      new NextRequest(`https://example.com${path}`, { method })
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
  });
});
