import { describe, expect, it, vi } from "vitest";
import { fetchRuntimeJson, toPublicStorageUrl } from "@ocnoer/story-core";

import {
  BUNDLED_RUNTIME_ORIGIN,
  createBundledRuntimeFetcher
} from "./bundledRuntime";

describe("bundled story runtime", () => {
  it("loads JSON and repeated image/audio references entirely from bundled files", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const resolveMediaUri = vi.fn(
      async (id: number) =>
        `file:///app/story/${id}.${id === 2 ? "m4a" : "png"}`
    );
    const documents = {
      "runtime/runtime/chapter.json": {
        chapter: {
          imagePath: "runtime/media/portrait",
          filePath:
            "https://project.supabase.co/storage/v1/object/public/runtime/media/music",
          imageDerivatives: [{ storagePath: "runtime/media/portrait" }],
          nextChapterPath: "runtime/runtime/next.json"
        }
      },
      "runtime/runtime/next.json": {
        chapter: { imagePath: "runtime/media/portrait" }
      }
    };
    const fetcher = createBundledRuntimeFetcher({
      documents,
      mediaModules: { "runtime/media/portrait": 1, "runtime/media/music": 2 },
      resolveMediaUri
    });
    const result = await fetchRuntimeJson(
      BUNDLED_RUNTIME_ORIGIN,
      "runtime/runtime/chapter.json",
      { fetcher }
    );
    expect(result).toEqual({
      chapter: {
        imagePath: "file:///app/story/1.png",
        filePath: "file:///app/story/2.m4a",
        imageDerivatives: [{ storagePath: "file:///app/story/1.png" }],
        nextChapterPath: "runtime/runtime/next.json"
      }
    });
    await fetchRuntimeJson(
      BUNDLED_RUNTIME_ORIGIN,
      "runtime/runtime/next.json",
      { fetcher }
    );
    expect(resolveMediaUri).toHaveBeenCalledTimes(2);
    expect(network).not.toHaveBeenCalled();
    expect(documents["runtime/runtime/chapter.json"].chapter.imagePath).toBe(
      "runtime/media/portrait"
    );
    network.mockRestore();
  });

  it("fails closed when a bundled document is missing", async () => {
    const fetcher = createBundledRuntimeFetcher({
      documents: {},
      mediaModules: {},
      resolveMediaUri: vi.fn()
    });
    await expect(
      fetchRuntimeJson(BUNDLED_RUNTIME_ORIGIN, "runtime/runtime/missing.json", {
        fetcher
      })
    ).rejects.toThrow("Bundled runtime document is missing");
  });

  it("rejects a media resolver that returns a network URL", async () => {
    const fetcher = createBundledRuntimeFetcher({
      documents: {
        "runtime/runtime/chapter.json": { imagePath: "runtime/media/image" }
      },
      mediaModules: { "runtime/media/image": 1 },
      resolveMediaUri: async () => "https://example.com/image.png"
    });
    await expect(
      fetchRuntimeJson(BUNDLED_RUNTIME_ORIGIN, "runtime/runtime/chapter.json", {
        fetcher
      })
    ).rejects.toThrow("did not resolve to a local file");
  });

  it("preserves a local file URI through shared image and music resolution", () => {
    expect(
      toPublicStorageUrl(BUNDLED_RUNTIME_ORIGIN, "file:///app/story/image.png")
    ).toBe("file:///app/story/image.png");
    expect(
      toPublicStorageUrl(
        "https://project.supabase.co",
        "runtime/media/image.png"
      )
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/runtime/media/image.png"
    );
  });
});
