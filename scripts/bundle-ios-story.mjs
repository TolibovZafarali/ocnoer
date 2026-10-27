#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const mimeExtensions = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "video/webm": "webm",
  "audio/webm": "webm"
};
const assetPathKey = /(?:path|url|uri)$/i;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function safeRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((part) => part === "..")
  ) {
    throw new Error("Storage export contains an unsafe relative path.");
  }
  return value;
}

export function canonicalStoragePath(value, bucket) {
  const marker = "/storage/v1/object/public/";
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value);
    const markerIndex = parsed.pathname.indexOf(marker);
    return markerIndex < 0
      ? null
      : decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  }
  return value.startsWith(`${bucket}/`) ? value : null;
}

function validateReferences(
  value,
  availableKeys,
  bucket,
  location = "runtime",
  key = "",
  references = new Set()
) {
  if (typeof value === "string") {
    const storagePath = canonicalStoragePath(value, bucket);
    if (storagePath && !availableKeys.has(storagePath)) {
      throw new Error(
        `Missing bundled content reference at ${location}: ${storagePath}`
      );
    }
    if (!storagePath && value && assetPathKey.test(key)) {
      throw new Error(`Unresolved bundled content reference at ${location}`);
    }
    if (storagePath) references.add(storagePath);
    return references;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateReferences(
        entry,
        availableKeys,
        bucket,
        `${location}[${index}]`,
        key,
        references
      )
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, entry]) =>
      validateReferences(
        entry,
        availableKeys,
        bucket,
        `${location}.${childKey}`,
        childKey,
        references
      )
    );
  }
  return references;
}

function getAssetExtension(record, bytes) {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return "webm";
  if (bytes.subarray(0, 4).toString() === "OggS") return "ogg";
  if (bytes.subarray(4, 8).toString() === "ftyp") return "m4a";
  if (bytes.subarray(0, 4).toString() === "RIFF") {
    if (bytes.subarray(8, 12).toString() === "WAVE") return "wav";
    if (bytes.subarray(8, 12).toString() === "WEBP") return "webp";
  }
  if (bytes.subarray(0, 3).toString() === "ID3") return "mp3";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    return "png";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "jpg";
  if (bytes.subarray(0, 512).toString("utf8").includes("<svg")) return "svg";
  const mimeType = record.mimeType?.split(";")[0].trim().toLowerCase();
  if (mimeExtensions[mimeType]) return mimeExtensions[mimeType];
  const extension = path.extname(record.path).slice(1).toLowerCase();
  if (Object.values(mimeExtensions).includes(extension)) return extension;
  throw new Error(`Cannot determine bundled media type: ${record.path}`);
}

export async function bundleIosStory({
  sourceDirectory,
  outputRoot = workspaceRoot
}) {
  const sourceRoot = path.resolve(sourceDirectory);
  const manifestBytes = await fs.readFile(
    path.join(sourceRoot, "manifest.json")
  );
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.backupType !== "supabase-storage" ||
    !Array.isArray(manifest.files) ||
    !manifest.bucket
  ) {
    throw new Error(
      "Expected a complete Storage export with a root manifest.json."
    );
  }
  if (manifest.fileCount !== manifest.files.length)
    throw new Error("Storage export file count does not match its manifest.");
  const candidates = new Map();
  const availableKeys = new Set();
  for (const record of [...manifest.files].sort((a, b) =>
    a.path.localeCompare(b.path, "en")
  )) {
    safeRelativePath(record.path);
    const localPath = safeRelativePath(record.localPath ?? record.path);
    const bytes = await fs.readFile(path.join(sourceRoot, localPath));
    const sha256 = digest(bytes);
    if (bytes.length !== record.size || sha256 !== record.sha256) {
      throw new Error(`Storage export integrity check failed: ${record.path}`);
    }
    const storagePath = `${manifest.bucket}/${record.path}`;
    if (availableKeys.has(storagePath))
      throw new Error(`Duplicate Storage export key: ${storagePath}`);
    availableKeys.add(storagePath);
    if (record.path.startsWith("runtime/") && record.path.endsWith(".json")) {
      candidates.set(storagePath, {
        storagePath,
        bytes,
        sha256,
        destination: `json/${sha256}.json`,
        kind: "json",
        value: JSON.parse(bytes)
      });
    } else if (
      record.path.startsWith("media/") ||
      record.path.startsWith("runtime/")
    ) {
      candidates.set(storagePath, {
        storagePath,
        bytes,
        sha256,
        record,
        kind: "media"
      });
    }
  }
  const bundledKeys = new Set(candidates.keys());
  const manifestPath = `${manifest.bucket}/runtime/manifest.json`;
  if (!bundledKeys.has(manifestPath))
    throw new Error("Storage export has no runtime manifest.");
  const selected = new Set();
  const mediaAliases = {};
  const pending = [manifestPath];
  while (pending.length) {
    const storagePath = pending.pop();
    if (selected.has(storagePath)) continue;
    selected.add(storagePath);
    const file = candidates.get(storagePath);
    if (file.kind === "json") {
      pending.push(
        ...validateReferences(
          file.value,
          bundledKeys,
          manifest.bucket,
          storagePath
        )
      );
      continue;
    }
    const extension = getAssetExtension(file.record, file.bytes);
    if (extension === "webm" || extension === "ogg") {
      const fallback = [".ios.m4a", ".ios.mp3", ".m4a", ".mp3"]
        .map((suffix) => `${storagePath}${suffix}`)
        .find((key) => {
          const candidate = candidates.get(key);
          return (
            candidate?.kind === "media" &&
            ["m4a", "mp3", "aac", "wav"].includes(
              getAssetExtension(candidate.record, candidate.bytes)
            )
          );
        });
      if (!fallback)
        throw new Error(
          `Referenced audio requires an iOS-compatible derivative: ${storagePath}`
        );
      mediaAliases[storagePath] = fallback;
      pending.push(fallback);
      continue;
    }
    if (
      extension === "svg" &&
      /(?:href|src)\s*=\s*["'](?:https?:)?\/\/|url\s*\(\s*["']?(?:https?:)?\/\//i.test(
        file.bytes.toString("utf8")
      )
    ) {
      throw new Error(
        `Bundled SVG references an external resource: ${storagePath}`
      );
    }
    file.destination = `media/${file.sha256}.${extension}`;
  }
  const files = [...candidates.values()].filter(
    (file) => selected.has(file.storagePath) && !mediaAliases[file.storagePath]
  );
  const assetsRoot = path.join(outputRoot, "apps/ios/assets/story");
  const generatedRoot = path.join(outputRoot, "apps/ios/src/runtime/generated");
  await fs.mkdir(assetsRoot, { recursive: true });
  await fs.mkdir(generatedRoot, { recursive: true });
  for (const file of files) {
    const destination = path.join(assetsRoot, file.destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.bytes);
  }
  const registry = (kind) =>
    [
      ...files
        .filter((file) => file.kind === kind)
        .map(
          (file) =>
            `    ${JSON.stringify(file.storagePath)}: require(${JSON.stringify(`../../../assets/story/${file.destination}`)})`
        ),
      ...(kind === "media"
        ? Object.entries(mediaAliases)
            .sort(([a], [b]) => a.localeCompare(b, "en"))
            .map(
              ([source, target]) =>
                `    ${JSON.stringify(source)}: require(${JSON.stringify(`../../../assets/story/${candidates.get(target).destination}`)})`
            )
        : [])
    ].join(",\n");
  await fs.writeFile(
    path.join(generatedRoot, "storyRegistry.ts"),
    `// Generated by scripts/bundle-ios-story.mjs.\n` +
      `export function getBundledDocuments(): Record<string, unknown> {\n  return {\n${registry("json")}\n  };\n}\n\n` +
      `export function getBundledMediaModules(): Record<string, number> {\n  return {\n${registry("media")}\n  };\n}\n`
  );
  const summary = {
    formatVersion: 1,
    sourceCreatedAt: manifest.createdAt,
    sourceManifestSha256: digest(manifestBytes),
    bucket: manifest.bucket,
    manifestPath,
    sourceFileCount: manifest.files.length,
    bundledFileCount: files.length,
    bundledBytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
    mediaAliases,
    files: files.map(({ storagePath, destination, sha256, bytes, kind }) => ({
      storagePath,
      localPath: destination,
      sha256,
      size: bytes.length,
      kind
    }))
  };
  await fs.writeFile(
    path.join(generatedRoot, "storyManifest.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  const destinations = new Set(files.map((file) => file.destination));
  for (const subdirectory of ["json", "media"]) {
    for (const entry of await fs.readdir(path.join(assetsRoot, subdirectory), {
      withFileTypes: true
    })) {
      const relativePath = `${subdirectory}/${entry.name}`;
      if (
        entry.isFile() &&
        /^[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.name) &&
        !destinations.has(relativePath)
      ) {
        await fs.rm(path.join(assetsRoot, relativePath));
      }
    }
  }
  return summary;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const sourceDirectory = process.argv[2];
  if (!sourceDirectory)
    throw new Error(
      "Usage: node scripts/bundle-ios-story.mjs <storage-export-directory>"
    );
  const summary = await bundleIosStory({ sourceDirectory });
  process.stdout.write(
    `Bundled ${summary.bundledFileCount} story files (${summary.bundledBytes} bytes).\n`
  );
}
