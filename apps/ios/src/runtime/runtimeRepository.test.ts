import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-asset", async () => {
  const { readFileSync } = await import("node:fs");
  const { URL } = await import("node:url");
  const manifest = JSON.parse(
    readFileSync(
      new URL("./generated/storyManifest.json", import.meta.url),
      "utf8"
    )
  );
  const media = manifest.files.filter(
    (file: { kind: string }) => file.kind === "media"
  );

  return {
    Asset: {
      fromModule: (id: number) => ({
        downloadAsync: async () => ({
          localUri: new URL(
            `../../assets/story/${media[id - 1].localPath}`,
            import.meta.url
          ).href
        })
      })
    }
  };
});

vi.mock("./generated/storyRegistry", async () => {
  const { readFileSync } = await import("node:fs");
  const { URL } = await import("node:url");
  const manifest = JSON.parse(
    readFileSync(
      new URL("./generated/storyManifest.json", import.meta.url),
      "utf8"
    )
  );
  type BundledFile = { kind: string; storagePath: string; localPath: string };
  const files: BundledFile[] = manifest.files;

  return {
    getBundledDocuments: () =>
      Object.fromEntries(
        files
          .filter((file) => file.kind === "json")
          .map((file) => [
            file.storagePath,
            JSON.parse(
              readFileSync(
                new URL(
                  `../../assets/story/${file.localPath}`,
                  import.meta.url
                ),
                "utf8"
              )
            )
          ])
      ),
    getBundledMediaModules: () => {
      const modules = Object.fromEntries(
        files
          .filter((file) => file.kind === "media")
          .map((file, index) => [file.storagePath, index + 1])
      );
      for (const [original, replacement] of Object.entries(
        manifest.mediaAliases as Record<string, string>
      )) {
        modules[original] = modules[replacement];
      }
      return modules;
    }
  };
});

import { getPlayerRuntimeChapterAssetRefs } from "@ocnoer/story-core";

import { createMobileRuntimeRepository } from "./runtimeRepository";

describe("packaged story startup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("boots and loads every packaged chapter without an API or Storage connection", async () => {
    vi.stubEnv("EXPO_PUBLIC_OCNOER_CONTENT_MODE", undefined);
    vi.stubEnv("EXPO_PUBLIC_OCNOER_SUPABASE_URL", undefined);
    vi.stubEnv("EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH", undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error("Network is unavailable.");
    });
    vi.stubGlobal("fetch", fetchMock);
    const repository = createMobileRuntimeRepository();
    const bootstrap = await repository.loadBootstrap();

    expect(bootstrap.initialReaderState).not.toBeNull();
    expect(bootstrap.initialBundle).not.toBeNull();
    expect(bootstrap.initialManifest.chapters.length).toBeGreaterThan(0);

    for (const chapter of bootstrap.initialManifest.chapters) {
      const bundle = await repository.loadChapter(
        bootstrap.initialManifest,
        chapter.id
      );
      const assets = getPlayerRuntimeChapterAssetRefs({
        supabaseUrl: repository.config.supabaseUrl,
        bundle,
        branchFlags: {}
      });

      for (const asset of assets) {
        expect(asset.url).toMatch(/^file:\/\//);
        for (const derivative of asset.derivatives ?? []) {
          expect(derivative.url).toMatch(/^file:\/\//);
        }
      }
    }

    await expect(
      repository.loadSession({
        progress: null,
        initialManifest: bootstrap.initialManifest
      })
    ).resolves.toMatchObject({ bundle: bootstrap.initialBundle });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
