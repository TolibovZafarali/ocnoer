import { useEffect, useState } from "react";
import { File, Directory, Paths } from "expo-file-system";
import {
  Image as ExpoImage,
  type ImageRef,
  type ImageSource
} from "expo-image";
import { parse, type JsxAST } from "react-native-svg";

import type { PlayerRuntimeImageAssetRef } from "@ocnoer/story-core";

const READER_ASSET_CACHE_DIRECTORY = "ocnoer-reader-assets-v1";
const MAX_CONCURRENT_ASSET_DOWNLOADS = 3;
const PRELOAD_TIMEOUT_MS = 3500;
const KNOWN_CACHE_EXTENSIONS = [
  "embedded.png",
  "embedded.jpg",
  "embedded.jpeg",
  "embedded.webp",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "svg",
  "bin"
];

export type ReaderAssetRenderKind =
  | "bitmap"
  | "svg-vector"
  | "svg-raster-wrapper"
  | "unknown";

export type ReaderAssetRef = PlayerRuntimeImageAssetRef & {
  contentType?: string | null;
  renderKind?: ReaderAssetRenderKind;
};

export type ReaderCachedAsset = {
  cacheKey: string;
  localUri: string;
  renderKind: ReaderAssetRenderKind;
  role: ReaderAssetRef["role"];
  sourceUrl: string;
  storagePath: string;
  bytes: number;
  contentType: string | null;
  fromCache: boolean;
  warnings: string[];
  layoutMetrics: ReaderAssetLayoutMetrics | null;
};

export type ReaderAssetCacheError = {
  assetRef: ReaderAssetRef;
  message: string;
};

export type ReaderAssetCacheResult = {
  status: "success" | "error";
  scope: "scene" | "chapter" | "warm";
  scopeId: string;
  durationMs: number;
  assets: ReaderCachedAsset[];
  errors: ReaderAssetCacheError[];
};

type ReaderImagePreloadOptions = {
  waitForCompletion?: boolean;
};

type SvgPayloadClassification = {
  renderKind: ReaderAssetRenderKind;
  embeddedRaster: {
    mimeType: string;
    extension: string;
    base64: string;
  } | null;
  layoutMetrics: ReaderAssetLayoutMetrics | null;
  warnings: string[];
};

export type ReaderAssetLayoutMetrics = {
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  svgWrapper?: {
    width: number;
    height: number;
    viewBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    embeddedImage: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  } | null;
};

type ReaderCacheMetadata = {
  layoutMetrics?: ReaderAssetLayoutMetrics | null;
};

const nativeImageRefCache = new Map<string, ImageRef>();
const inFlightNativeImageLoads = new Map<string, Promise<ImageRef | null>>();
const svgAstCache = new Map<string, JsxAST>();
const inFlightSvgAstLoads = new Map<string, Promise<JsxAST | null>>();
const cachedAssetsByUrl = new Map<string, ReaderCachedAsset>();
const cachedAssetsByKey = new Map<string, ReaderCachedAsset>();
const inFlightAssetLoads = new Map<string, Promise<ReaderCachedAsset>>();

let activeDownloadCount = 0;
const queuedDownloads: Array<() => void> = [];

function isDevelopment() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function logAssetMetric(message: string, details?: Record<string, unknown>) {
  if (!isDevelopment()) {
    return;
  }

  if (details) {
    console.info(`[reader-assets] ${message}`, details);
    return;
  }

  console.info(`[reader-assets] ${message}`);
}

function logAssetWarning(message: string, details?: Record<string, unknown>) {
  if (!isDevelopment()) {
    return;
  }

  if (details) {
    console.warn(`[reader-assets] ${message}`, details);
    return;
  }

  console.warn(`[reader-assets] ${message}`);
}

function isRemoteImageUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLocalUri(value: string) {
  return /^file:\/\//i.test(value);
}

function withTimeout(promise: Promise<unknown>) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, PRELOAD_TIMEOUT_MS);

    promise
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

function settlePreloadPromise(
  promise: Promise<unknown>,
  options?: ReaderImagePreloadOptions
) {
  if (options?.waitForCompletion) {
    return promise.catch(() => undefined).then(() => undefined);
  }

  return withTimeout(promise);
}

function runWithDownloadLimit<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeDownloadCount += 1;

      task()
        .then(resolve, reject)
        .finally(() => {
          activeDownloadCount -= 1;
          queuedDownloads.shift()?.();
        });
    };

    if (activeDownloadCount < MAX_CONCURRENT_ASSET_DOWNLOADS) {
      run();
      return;
    }

    queuedDownloads.push(run);
  });
}

function stableHash(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeCacheToken(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function getResolvedCacheKey(assetRef: ReaderAssetRef) {
  return normalizeCacheToken(
    `${assetRef.role}-${stableHash(
      assetRef.cacheKey || assetRef.storagePath || assetRef.url
    )}`
  );
}

function getCacheDirectory() {
  return new Directory(Paths.cache, READER_ASSET_CACHE_DIRECTORY);
}

function ensureCacheDirectory() {
  getCacheDirectory().create({
    idempotent: true,
    intermediates: true
  });
}

function getCacheFile(cacheKey: string, extension: string) {
  return new File(getCacheDirectory(), `${cacheKey}.${extension}`);
}

function getCacheMetadataFile(cacheKey: string) {
  return new File(getCacheDirectory(), `${cacheKey}.metadata.json`);
}

function getFileSize(file: File) {
  try {
    const info = file.info();
    return info.exists ? (info.size ?? file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

function isReadyFile(file: File) {
  return getFileSize(file) > 0;
}

function readCacheMetadata(cacheKey: string): ReaderCacheMetadata | null {
  const file = getCacheMetadataFile(cacheKey);

  if (!isReadyFile(file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(file.textSync()) as ReaderCacheMetadata;

    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

function writeCacheMetadata(
  cacheKey: string,
  metadata: ReaderCacheMetadata | null
) {
  if (!metadata?.layoutMetrics) {
    return;
  }

  try {
    getCacheMetadataFile(cacheKey).write(JSON.stringify(metadata));
  } catch {
    logAssetWarning("unable to write asset metadata", {
      cacheKey
    });
  }
}

function getPathExtension(value: string | null | undefined) {
  const path = value?.split(/[?#]/)[0] ?? "";
  const fileName = path.split("/").pop() ?? "";
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

  return match?.[1]?.toLowerCase() ?? null;
}

function extensionFromContentType(contentType: string | null | undefined) {
  const normalizedContentType = contentType?.toLowerCase() ?? "";

  if (normalizedContentType.includes("image/png")) {
    return "png";
  }

  if (
    normalizedContentType.includes("image/jpeg") ||
    normalizedContentType.includes("image/jpg")
  ) {
    return "jpg";
  }

  if (normalizedContentType.includes("image/webp")) {
    return "webp";
  }

  if (normalizedContentType.includes("image/svg")) {
    return "svg";
  }

  return null;
}

function extensionFromBytes(bytes: Uint8Array) {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "jpg";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

function decodeBytePrefix(bytes: Uint8Array, maxBytes: number) {
  const prefixBytes = bytes.slice(0, maxBytes);
  let output = "";

  for (let index = 0; index < prefixBytes.length; index += 1) {
    output += String.fromCharCode(prefixBytes[index] ?? 0);
  }

  return output;
}

function bytesLookLikeSvg(bytes: Uint8Array) {
  const prefix = decodeBytePrefix(bytes, 2048)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();

  return (
    prefix.startsWith("<svg") ||
    (prefix.startsWith("<?xml") && prefix.includes("<svg"))
  );
}

function decodeUtf8Bytes(bytes: Uint8Array) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  const chunkSize = 8192;
  let output = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return output;
}

function decodeBase64Bytes(base64: string) {
  const normalizedBase64 = base64.replace(/\s/g, "");
  const padding = normalizedBase64.endsWith("==")
    ? 2
    : normalizedBase64.endsWith("=")
      ? 1
      : 0;
  const output = new Uint8Array(
    Math.floor((normalizedBase64.length * 3) / 4) - padding
  );
  let buffer = 0;
  let bits = 0;
  let outputIndex = 0;

  for (let index = 0; index < normalizedBase64.length; index += 1) {
    const char = normalizedBase64.charAt(index);

    if (char === "=") {
      break;
    }

    const value =
      char >= "A" && char <= "Z"
        ? char.charCodeAt(0) - 65
        : char >= "a" && char <= "z"
          ? char.charCodeAt(0) - 71
          : char >= "0" && char <= "9"
            ? char.charCodeAt(0) + 4
            : char === "+"
              ? 62
              : char === "/"
                ? 63
                : -1;

    if (value < 0) {
      continue;
    }

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output[outputIndex] = (buffer >> bits) & 0xff;
      outputIndex += 1;
    }
  }

  return outputIndex === output.length ? output : output.slice(0, outputIndex);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

function getRasterDimensionsFromBytes(input: {
  bytes: Uint8Array;
  mimeType: string;
}) {
  if (
    input.mimeType === "image/png" &&
    input.bytes.length >= 24 &&
    input.bytes[0] === 0x89 &&
    input.bytes[1] === 0x50 &&
    input.bytes[2] === 0x4e &&
    input.bytes[3] === 0x47
  ) {
    const width = readUint32BigEndian(input.bytes, 16);
    const height = readUint32BigEndian(input.bytes, 20);

    return width > 0 && height > 0
      ? {
          width,
          height
        }
      : null;
  }

  return null;
}

function createAssetRecord(input: {
  assetRef: ReaderAssetRef;
  cacheKey: string;
  file: File;
  renderKind: ReaderAssetRenderKind;
  contentType: string | null;
  fromCache: boolean;
  layoutMetrics?: ReaderAssetLayoutMetrics | null;
  warnings?: string[];
}): ReaderCachedAsset {
  const record: ReaderCachedAsset = {
    cacheKey: input.cacheKey,
    localUri: input.file.uri,
    renderKind: input.renderKind,
    role: input.assetRef.role,
    sourceUrl: input.assetRef.url,
    storagePath: input.assetRef.storagePath,
    bytes: getFileSize(input.file),
    contentType: input.contentType,
    fromCache: input.fromCache,
    warnings: input.warnings ?? [],
    layoutMetrics: input.layoutMetrics ?? null
  };

  if (!input.fromCache) {
    writeCacheMetadata(input.cacheKey, {
      layoutMetrics: record.layoutMetrics
    });
  }

  cachedAssetsByUrl.set(input.assetRef.url, record);
  cachedAssetsByKey.set(input.cacheKey, record);
  return record;
}

function getCachedRecord(assetRefOrUrl: ReaderAssetRef | string) {
  const url =
    typeof assetRefOrUrl === "string" ? assetRefOrUrl : assetRefOrUrl.url;
  const record = cachedAssetsByUrl.get(url) ?? null;

  if (!record) {
    return null;
  }

  if (isReadyFile(new File(record.localUri))) {
    return record;
  }

  cachedAssetsByUrl.delete(record.sourceUrl);
  cachedAssetsByKey.delete(record.cacheKey);
  return null;
}

function findExistingCachedAsset(assetRef: ReaderAssetRef, cacheKey: string) {
  const knownRecord = cachedAssetsByKey.get(cacheKey) ?? null;

  if (knownRecord && isReadyFile(new File(knownRecord.localUri))) {
    cachedAssetsByUrl.set(assetRef.url, knownRecord);
    return knownRecord;
  }

  for (const extension of KNOWN_CACHE_EXTENSIONS) {
    const file = getCacheFile(cacheKey, extension);

    if (!isReadyFile(file)) {
      continue;
    }

    const renderKind = extension === "svg" ? "svg-vector" : "bitmap";
    const metadata = readCacheMetadata(cacheKey);

    return createAssetRecord({
      assetRef,
      cacheKey,
      file,
      renderKind,
      contentType: null,
      fromCache: true,
      layoutMetrics: metadata?.layoutMetrics ?? null,
      warnings: extension.startsWith("embedded.")
        ? ["Using extracted embedded raster from cached SVG wrapper."]
        : []
    });
  }

  return null;
}

function responseNeedsTextBody(
  assetRef: ReaderAssetRef,
  contentType: string | null
) {
  const extension =
    extensionFromContentType(contentType) ??
    getPathExtension(assetRef.storagePath) ??
    getPathExtension(assetRef.url);

  return extension === "svg";
}

function inferBitmapExtension(input: {
  assetRef: ReaderAssetRef;
  contentType: string | null;
  bytes: Uint8Array;
}) {
  return (
    extensionFromContentType(input.contentType) ??
    extensionFromBytes(input.bytes) ??
    getPathExtension(input.assetRef.storagePath) ??
    getPathExtension(input.assetRef.url) ??
    (input.assetRef.role === "background" ? "png" : "bin")
  );
}

function getFirstTag(source: string, tagName: string) {
  return source.match(new RegExp(`<${tagName}\\b[^>]*>`, "i"))?.[0] ?? null;
}

function getTagAttribute(tag: string | null, attributeName: string) {
  if (!tag) {
    return null;
  }

  const match = tag.match(
    new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "i")
  );

  return match?.[1] ?? null;
}

function parseSvgNumber(value: string | null) {
  if (!value || value.trim().endsWith("%")) {
    return null;
  }

  const match = value.trim().match(/^-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSvgCoordinate(value: string | null) {
  if (!value || value.trim().endsWith("%")) {
    return 0;
  }

  const match = value.trim().match(/^-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSvgViewBox(value: string | null) {
  const parts = value
    ?.trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (
    !parts ||
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    (parts[2] ?? 0) <= 0 ||
    (parts[3] ?? 0) <= 0
  ) {
    return null;
  }

  return {
    x: parts[0] ?? 0,
    y: parts[1] ?? 0,
    width: parts[2] ?? 0,
    height: parts[3] ?? 0
  };
}

function getSvgLayoutMetrics(input: {
  svgXml: string;
  embeddedImageTag: string | null;
}): ReaderAssetLayoutMetrics | null {
  const svgTag = getFirstTag(input.svgXml, "svg");
  const viewBox = parseSvgViewBox(getTagAttribute(svgTag, "viewBox"));
  const svgWidth = parseSvgNumber(getTagAttribute(svgTag, "width"));
  const svgHeight = parseSvgNumber(getTagAttribute(svgTag, "height"));
  const canvasWidth = viewBox?.width ?? svgWidth;
  const canvasHeight = viewBox?.height ?? svgHeight;

  if (!canvasWidth || !canvasHeight) {
    return null;
  }

  const imageWidth =
    parseSvgNumber(getTagAttribute(input.embeddedImageTag, "width")) ??
    canvasWidth;
  const imageHeight =
    parseSvgNumber(getTagAttribute(input.embeddedImageTag, "height")) ??
    canvasHeight;
  const imageX =
    parseSvgCoordinate(getTagAttribute(input.embeddedImageTag, "x")) -
    (viewBox?.x ?? 0);
  const imageY =
    parseSvgCoordinate(getTagAttribute(input.embeddedImageTag, "y")) -
    (viewBox?.y ?? 0);

  return {
    svgWrapper: {
      width: canvasWidth,
      height: canvasHeight,
      viewBox,
      embeddedImage: input.embeddedImageTag
        ? {
            x: imageX,
            y: imageY,
            width: imageWidth,
            height: imageHeight
          }
        : null
    }
  };
}

export function classifySvgAssetPayload(
  svgXml: string
): SvgPayloadClassification {
  // Phase 2 TODO: add scripts/convert-reader-character-assets.mjs to scan
  // runtime character SVG wrappers, extract data:image/* payloads, optionally
  // transcode through sharp to WebP, upload extensioned files, and emit
  // renderKind/contentType/hash metadata into the runtime asset manifest.
  const trimmedSvg = svgXml.trimStart();
  const hasSvgRoot =
    /^<svg\b/i.test(trimmedSvg) || /^<\?xml\b[\s\S]*?<svg\b/i.test(trimmedSvg);

  if (!hasSvgRoot) {
    return {
      renderKind: "unknown",
      embeddedRaster: null,
      layoutMetrics: null,
      warnings: ["SVG payload does not start with an <svg> root."]
    };
  }

  const embeddedImages = Array.from(svgXml.matchAll(/<image\b[^>]*>/gi))
    .map((match) => {
      const tag = match[0];
      const href =
        getTagAttribute(tag, "href") ?? getTagAttribute(tag, "xlink:href");
      const embeddedMatch = href?.match(
        /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i
      );

      return embeddedMatch
        ? {
            tag,
            mimeType: embeddedMatch[1]?.toLowerCase() ?? "image/png",
            base64: embeddedMatch[2] ?? ""
          }
        : null;
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  if (embeddedImages.length === 0) {
    return {
      renderKind: "svg-vector",
      embeddedRaster: null,
      layoutMetrics: getSvgLayoutMetrics({
        svgXml,
        embeddedImageTag: null
      }),
      warnings: []
    };
  }

  const largestEmbeddedImage = embeddedImages.reduce((largest, current) =>
    current.base64.length > largest.base64.length ? current : largest
  );
  const extension =
    largestEmbeddedImage.mimeType === "image/webp"
      ? "webp"
      : largestEmbeddedImage.mimeType === "image/jpeg" ||
          largestEmbeddedImage.mimeType === "image/jpg"
        ? "jpg"
        : "png";

  return {
    renderKind: "svg-raster-wrapper",
    embeddedRaster: {
      mimeType: largestEmbeddedImage.mimeType,
      extension,
      base64: largestEmbeddedImage.base64
    },
    layoutMetrics: getSvgLayoutMetrics({
      svgXml,
      embeddedImageTag: largestEmbeddedImage.tag
    }),
    warnings: [
      `Detected ${embeddedImages.length} embedded raster image(s) inside SVG.`
    ]
  };
}

async function predecodeBitmapAsset(record: ReaderCachedAsset) {
  if (record.renderKind === "svg-vector") {
    return;
  }

  await ExpoImage.prefetch([record.localUri], {
    cachePolicy: "memory-disk"
  }).catch(() => false);
  await loadReaderImageRef(record.sourceUrl);
}

async function writeSvgAsset(input: {
  assetRef: ReaderAssetRef;
  cacheKey: string;
  contentType: string | null;
  svgXml: string;
}) {
  const classification = classifySvgAssetPayload(input.svgXml);

  if (classification.embeddedRaster) {
    const embeddedRasterBytes = decodeBase64Bytes(
      classification.embeddedRaster.base64
    );
    const embeddedRasterDimensions = getRasterDimensionsFromBytes({
      bytes: embeddedRasterBytes,
      mimeType: classification.embeddedRaster.mimeType
    });
    const layoutMetrics: ReaderAssetLayoutMetrics | null = {
      ...classification.layoutMetrics,
      naturalWidth:
        embeddedRasterDimensions?.width ??
        classification.layoutMetrics?.naturalWidth,
      naturalHeight:
        embeddedRasterDimensions?.height ??
        classification.layoutMetrics?.naturalHeight
    };
    const file = getCacheFile(
      input.cacheKey,
      `embedded.${classification.embeddedRaster.extension}`
    );

    file.write(embeddedRasterBytes);

    if (!isReadyFile(file)) {
      throw new Error("Cached embedded raster file is empty.");
    }

    return createAssetRecord({
      assetRef: input.assetRef,
      cacheKey: input.cacheKey,
      file,
      renderKind: "bitmap",
      contentType: classification.embeddedRaster.mimeType,
      fromCache: false,
      layoutMetrics,
      warnings: classification.warnings
    });
  }

  const file = getCacheFile(input.cacheKey, "svg");
  file.write(input.svgXml);

  if (!isReadyFile(file)) {
    throw new Error("Cached SVG file is empty.");
  }

  const svgAst = parse(input.svgXml);

  if (svgAst) {
    svgAstCache.set(input.assetRef.url, svgAst);
  }

  return createAssetRecord({
    assetRef: input.assetRef,
    cacheKey: input.cacheKey,
    file,
    renderKind:
      classification.renderKind === "svg-vector" ? "svg-vector" : "unknown",
    contentType: input.contentType,
    fromCache: false,
    layoutMetrics: classification.layoutMetrics,
    warnings: classification.warnings
  });
}

async function downloadAndCacheAsset(
  assetRef: ReaderAssetRef,
  cacheKey: string
) {
  ensureCacheDirectory();

  const existingCachedAsset = findExistingCachedAsset(assetRef, cacheKey);

  if (existingCachedAsset) {
    logAssetMetric("cache hit", {
      role: assetRef.role,
      storagePath: assetRef.storagePath
    });
    return existingCachedAsset;
  }

  const startedAt = Date.now();
  const response = await fetch(assetRef.url);

  if (!response.ok) {
    throw new Error(`Asset download failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type");
  let record: ReaderCachedAsset;

  if (responseNeedsTextBody(assetRef, contentType)) {
    record = await writeSvgAsset({
      assetRef,
      cacheKey,
      contentType,
      svgXml: await response.text()
    });
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytesLookLikeSvg(bytes)) {
      record = await writeSvgAsset({
        assetRef,
        cacheKey,
        contentType,
        svgXml: decodeUtf8Bytes(bytes)
      });
    } else {
      const extension = inferBitmapExtension({
        assetRef,
        contentType,
        bytes
      });
      const file = getCacheFile(cacheKey, extension);

      file.write(bytes);

      if (!isReadyFile(file)) {
        throw new Error("Cached bitmap file is empty.");
      }

      record = createAssetRecord({
        assetRef,
        cacheKey,
        file,
        renderKind: "bitmap",
        contentType,
        fromCache: false
      });
    }
  }

  await predecodeBitmapAsset(record);
  logAssetMetric("downloaded", {
    bytes: record.bytes,
    durationMs: Date.now() - startedAt,
    renderKind: record.renderKind,
    role: record.role,
    storagePath: record.storagePath
  });

  record.warnings.forEach((warning) =>
    logAssetWarning(warning, {
      role: record.role,
      storagePath: record.storagePath
    })
  );

  return record;
}

export async function ensureReaderAssetReady(assetRef: ReaderAssetRef) {
  if (!isRemoteImageUrl(assetRef.url)) {
    const file = new File(assetRef.url);

    if (isLocalUri(assetRef.url) && !isReadyFile(file)) {
      throw new Error(`Local asset is missing or empty: ${assetRef.url}`);
    }

    return createAssetRecord({
      assetRef,
      cacheKey: getResolvedCacheKey(assetRef),
      file,
      renderKind: assetRef.renderKind ?? "bitmap",
      contentType: assetRef.contentType ?? null,
      fromCache: true
    });
  }

  const cacheKey = getResolvedCacheKey(assetRef);
  const cachedRecord = findExistingCachedAsset(assetRef, cacheKey);

  if (cachedRecord) {
    return cachedRecord;
  }

  const existingLoad = inFlightAssetLoads.get(cacheKey);

  if (existingLoad) {
    return existingLoad;
  }

  const load = runWithDownloadLimit(() =>
    downloadAndCacheAsset(assetRef, cacheKey)
  ).finally(() => {
    inFlightAssetLoads.delete(cacheKey);
  });

  inFlightAssetLoads.set(cacheKey, load);
  return load;
}

async function ensureAssetRefsReady(input: {
  scope: ReaderAssetCacheResult["scope"];
  scopeId: string;
  assetRefs: ReaderAssetRef[];
}) {
  const startedAt = Date.now();
  const uniqueAssetRefs = Array.from(
    new Map(
      input.assetRefs
        .filter((assetRef) => assetRef.url.length > 0)
        .map((assetRef) => [assetRef.url, assetRef])
    ).values()
  );
  const settledResults = await Promise.allSettled(
    uniqueAssetRefs.map((assetRef) => ensureReaderAssetReady(assetRef))
  );
  const assets: ReaderCachedAsset[] = [];
  const errors: ReaderAssetCacheError[] = [];

  settledResults.forEach((result, index) => {
    const assetRef = uniqueAssetRefs[index];

    if (!assetRef) {
      return;
    }

    if (result.status === "fulfilled") {
      assets.push(result.value);
      return;
    }

    errors.push({
      assetRef,
      message:
        result.reason instanceof Error
          ? result.reason.message
          : "Unable to cache reader asset."
    });
  });

  const cacheResult: ReaderAssetCacheResult = {
    status: errors.length > 0 ? "error" : "success",
    scope: input.scope,
    scopeId: input.scopeId,
    durationMs: Date.now() - startedAt,
    assets,
    errors
  };

  if (cacheResult.status === "success") {
    logAssetMetric(`${input.scope} ready`, {
      assetCount: assets.length,
      durationMs: cacheResult.durationMs,
      scopeId: input.scopeId
    });
  } else {
    logAssetWarning(`${input.scope} asset readiness failed`, {
      errorCount: errors.length,
      scopeId: input.scopeId
    });
  }

  return cacheResult;
}

export function ensureSceneAssetsReady(
  sceneId: string,
  assetRefs: ReaderAssetRef[]
) {
  return ensureAssetRefsReady({
    scope: "scene",
    scopeId: sceneId,
    assetRefs
  });
}

export function ensureChapterAssetsReady(
  chapterId: string,
  assetRefs: ReaderAssetRef[]
) {
  return ensureAssetRefsReady({
    scope: "chapter",
    scopeId: chapterId,
    assetRefs
  });
}

export function warmNextSceneAssets(
  sceneId: string,
  assetRefs: ReaderAssetRef[]
) {
  return ensureAssetRefsReady({
    scope: "warm",
    scopeId: sceneId,
    assetRefs
  });
}

export function getAssetCacheErrorMessage(result: ReaderAssetCacheResult) {
  const firstError = result.errors[0];

  if (!firstError) {
    return null;
  }

  return `Unable to prepare ${result.scope} asset ${firstError.assetRef.storagePath}: ${firstError.message}`;
}

export function getCachedAssetUri(assetRefOrUrl: ReaderAssetRef | string) {
  return getCachedRecord(assetRefOrUrl)?.localUri ?? null;
}

export function getAssetRenderKind(assetRefOrUrl: ReaderAssetRef | string) {
  return getCachedRecord(assetRefOrUrl)?.renderKind ?? "unknown";
}

export function getAssetLayoutMetrics(assetRefOrUrl: ReaderAssetRef | string) {
  return getCachedRecord(assetRefOrUrl)?.layoutMetrics ?? null;
}

export function createReaderImageSource(imageUri: string): ImageSource {
  return {
    uri: imageUri,
    cacheKey: imageUri
  };
}

export function createCachedReaderImageSource(imageUrl: string) {
  const cachedUri = getCachedAssetUri(imageUrl);

  if (!cachedUri && isRemoteImageUrl(imageUrl)) {
    logAssetWarning("missing cached asset on visible render path", {
      imageUrl
    });
    return null;
  }

  return createReaderImageSource(cachedUri ?? imageUrl);
}

export function getPreloadedReaderImageRef(imageUrl: string) {
  return nativeImageRefCache.get(imageUrl) ?? null;
}

export function loadReaderImageRef(imageUrl: string) {
  const cachedUri = getCachedAssetUri(imageUrl);
  const renderUri = cachedUri ?? (isRemoteImageUrl(imageUrl) ? null : imageUrl);

  if (!renderUri) {
    return Promise.resolve(null);
  }

  const cachedImageRef = getPreloadedReaderImageRef(imageUrl);

  if (cachedImageRef) {
    return Promise.resolve(cachedImageRef);
  }

  const existingLoad = inFlightNativeImageLoads.get(imageUrl);

  if (existingLoad) {
    return existingLoad;
  }

  const load = ExpoImage.loadAsync({
    uri: renderUri,
    cacheKey: imageUrl
  })
    .then((imageRef) => {
      const record = cachedAssetsByUrl.get(imageUrl) ?? null;

      if (record) {
        record.layoutMetrics = {
          ...record.layoutMetrics,
          naturalWidth: imageRef.width,
          naturalHeight: imageRef.height
        };
        cachedAssetsByKey.set(record.cacheKey, record);
      }

      nativeImageRefCache.set(imageUrl, imageRef);
      return imageRef;
    })
    .catch(() => null)
    .finally(() => {
      inFlightNativeImageLoads.delete(imageUrl);
    });

  inFlightNativeImageLoads.set(imageUrl, load);
  return load;
}

export function getPreloadedReaderSvgAst(imageUrl: string) {
  return svgAstCache.get(imageUrl) ?? null;
}

export function loadReaderSvgAst(imageUrl: string) {
  if (getAssetRenderKind(imageUrl) !== "svg-vector") {
    return Promise.resolve(null);
  }

  const cachedSvgAst = getPreloadedReaderSvgAst(imageUrl);

  if (cachedSvgAst) {
    return Promise.resolve(cachedSvgAst);
  }

  const localUri = getCachedAssetUri(imageUrl);

  if (!localUri) {
    return Promise.resolve(null);
  }

  const existingLoad = inFlightSvgAstLoads.get(imageUrl);

  if (existingLoad) {
    return existingLoad;
  }

  const load = new File(localUri)
    .text()
    .then((svgXml) => {
      const trimmedSvg = svgXml.trimStart();

      if (
        !/^<svg\b/i.test(trimmedSvg) &&
        !/^<\?xml\b[\s\S]*?<svg\b/i.test(trimmedSvg)
      ) {
        return null;
      }

      const svgAst = parse(svgXml);

      if (!svgAst) {
        return null;
      }

      svgAstCache.set(imageUrl, svgAst);
      return svgAst;
    })
    .catch(() => null)
    .finally(() => {
      inFlightSvgAstLoads.delete(imageUrl);
    });

  inFlightSvgAstLoads.set(imageUrl, load);
  return load;
}

function createLegacyAssetRefs(imageUrls: string[]): ReaderAssetRef[] {
  return imageUrls.map((imageUrl) => ({
    role: "portrait" as const,
    url: imageUrl,
    storagePath: imageUrl,
    cacheKey: imageUrl
  }));
}

export function preloadReaderImageUrls(
  imageUrls: string[],
  options?: ReaderImagePreloadOptions
) {
  const assetRefs = createLegacyAssetRefs(
    Array.from(new Set(imageUrls)).filter((imageUrl) => imageUrl.length > 0)
  );

  if (assetRefs.length === 0) {
    return Promise.resolve();
  }

  return settlePreloadPromise(
    ensureAssetRefsReady({
      scope: "warm",
      scopeId: "legacy-preload",
      assetRefs
    }),
    options
  );
}

export function usePreloadedReaderImageRef(imageUrl: string | null) {
  const [, setLoadedVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl) {
      return;
    }

    const cachedImageRef = getPreloadedReaderImageRef(imageUrl);

    if (cachedImageRef) {
      return;
    }

    void loadReaderImageRef(imageUrl).then((loadedImageRef) => {
      if (!cancelled && loadedImageRef) {
        setLoadedVersion((currentValue) => currentValue + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return imageUrl ? getPreloadedReaderImageRef(imageUrl) : null;
}

export function usePreloadedReaderSvgAst(imageUrl: string | null) {
  const [, setLoadedVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl) {
      return;
    }

    const cachedSvgAst = getPreloadedReaderSvgAst(imageUrl);

    if (cachedSvgAst) {
      return;
    }

    void loadReaderSvgAst(imageUrl).then((loadedSvgAst) => {
      if (!cancelled && loadedSvgAst) {
        setLoadedVersion((currentValue) => currentValue + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return imageUrl ? getPreloadedReaderSvgAst(imageUrl) : null;
}

export function useReaderImagePreload(
  imageUrls: string[],
  options?: ReaderImagePreloadOptions
) {
  const preloadKey = imageUrls.join("|");
  const waitForCompletion = options?.waitForCompletion;

  useEffect(() => {
    if (imageUrls.length === 0) {
      return;
    }

    void preloadReaderImageUrls(imageUrls, {
      waitForCompletion
    });
  }, [imageUrls, preloadKey, waitForCompletion]);
}

export function useReaderAssetWarmup(assetRefs: ReaderAssetRef[]) {
  const preloadKey = assetRefs
    .map((assetRef) => assetRef.cacheKey || assetRef.url)
    .join("|");

  useEffect(() => {
    if (assetRefs.length === 0) {
      return;
    }

    void warmNextSceneAssets("presentation-warmup", assetRefs);
  }, [assetRefs, preloadKey]);
}
