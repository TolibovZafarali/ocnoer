import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundleIosStory } from "./bundle-ios-story.mjs";

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function createExport({
  imagePath = "runtime/media/portrait",
  corruptMedia = false,
  extraMedia = {}
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ocnoer-story-test-"));
  temporaryRoots.push(root);
  const sourceDirectory = path.join(root, "export");
  const documents = {
    "runtime/manifest.json": JSON.stringify({
      schemaVersion: 1,
      firstChapterId: "one",
      chapters: [{ id: "one", bundlePath: "runtime/runtime/chapters/one.json" }]
    }),
    "runtime/chapters/one.json": JSON.stringify({ chapter: { imagePath } }),
    "media/portrait":
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
    "history/authoring/old.json": JSON.stringify({ privateDraft: true }),
    "media/unused":
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
    ...extraMedia
  };
  const files = [];
  for (const [storagePath, text] of Object.entries(documents)) {
    const bytes = Buffer.from(text);
    const destination = path.join(sourceDirectory, storagePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
    files.push({
      path: storagePath,
      localPath: storagePath,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mimeType: storagePath.endsWith(".json")
        ? "application/json"
        : "image/svg+xml"
    });
  }
  await fs.writeFile(
    path.join(sourceDirectory, "manifest.json"),
    JSON.stringify({
      backupType: "supabase-storage",
      bucket: "runtime",
      createdAt: "2026-10-27T00:00:00Z",
      fileCount: files.length,
      files
    })
  );
  if (corruptMedia)
    await fs.appendFile(
      path.join(sourceDirectory, "media/portrait"),
      "changed"
    );
  return { sourceDirectory, outputRoot: path.join(root, "output") };
}

describe("iOS story bundle generation", () => {
  it("verifies the whole export and deterministically bundles only runtime and media", async () => {
    const input = await createExport();
    const first = await bundleIosStory(input);
    const second = await bundleIosStory(input);
    expect(second).toEqual(first);
    expect(first.sourceFileCount).toBe(5);
    expect(first.bundledFileCount).toBe(3);
    expect(
      first.files.some((file) => file.storagePath.includes("history/"))
    ).toBe(false);
    expect(first.files.find((file) => file.kind === "media").localPath).toMatch(
      /\.svg$/
    );
    const registry = await fs.readFile(
      path.join(
        input.outputRoot,
        "apps/ios/src/runtime/generated/storyRegistry.ts"
      ),
      "utf8"
    );
    expect(registry).toContain(
      '"runtime/media/portrait": require("../../../assets/story/media/'
    );
    expect(registry).not.toContain("privateDraft");
    expect(registry).not.toContain("runtime/media/unused");
  });

  it("rejects missing referenced media before writing the bundle", async () => {
    const input = await createExport({ imagePath: "runtime/media/missing" });
    await expect(bundleIosStory(input)).rejects.toThrow(
      "Missing bundled content reference"
    );
    await expect(fs.stat(input.outputRoot)).rejects.toThrow();
  });

  it("rejects external media URLs that would require a network connection", async () => {
    const input = await createExport({
      imagePath: "https://example.com/portrait.png"
    });
    await expect(bundleIosStory(input)).rejects.toThrow(
      "Unresolved bundled content reference"
    );
  });

  it("rejects altered export bytes", async () => {
    await expect(
      bundleIosStory(await createExport({ corruptMedia: true }))
    ).rejects.toThrow("Storage export integrity check failed");
  });

  it("uses a bundled iOS derivative when the source audio is WebM", async () => {
    const input = await createExport({
      imagePath: "runtime/media/music",
      extraMedia: {
        "media/music": Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
        "media/music.ios.m4a": Buffer.from([
          0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0
        ])
      }
    });
    const summary = await bundleIosStory(input);
    expect(summary.mediaAliases).toEqual({
      "runtime/media/music": "runtime/media/music.ios.m4a"
    });
    expect(summary.files.some((file) => file.localPath.endsWith(".webm"))).toBe(
      false
    );
    expect(summary.files.some((file) => file.localPath.endsWith(".m4a"))).toBe(
      true
    );
  });

  it("rejects unsupported referenced audio without a bundled playable derivative", async () => {
    const input = await createExport({
      imagePath: "runtime/media/music",
      extraMedia: {
        "media/music": Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])
      }
    });
    await expect(bundleIosStory(input)).rejects.toThrow(
      "requires an iOS-compatible derivative"
    );
  });
});
