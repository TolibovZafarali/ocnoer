import { useEffect, useState } from "react";
import { File, Directory, Paths } from "expo-file-system";
import {
  Image as ExpoImage,
  type ImageRef,
  type ImageSource
} from "expo-image";
import { parse, type JsxAST } from "react-native-svg";

import type { PlayerRuntimeImageAssetRef } from "@ocnoer/story-core";
import { resolveNativeReaderPortraitLayout } from "./portraitLayout";

const READER_ASSET_CACHE_DIRECTORY = "ocnoer-reader-assets-v2";
export const READER_ASSET_RENDER_CACHE_VERSION = 3;
const MAX_CONCURRENT_ASSET_DOWNLOADS = 3;
const MAX_CONCURRENT_IMAGE_DECODE = 1;
const PRELOAD_TIMEOUT_MS = 3500;
const DEFAULT_READER_STAGE_WIDTH = 393;
const DEFAULT_READER_STAGE_HEIGHT = 852;
const DEFAULT_READER_DEVICE_SCALE = 3;
const READER_PORTRAIT_VARIANT_SELECTION_MARGIN = 1.02;
const SOURCE_SVG_CACHE_EXTENSIONS = ["svg"];
const EXTRACTED_RASTER_CACHE_EXTENSIONS = [
  "embedded.png",
  "embedded.jpg",
  "embedded.jpeg",
  "embedded.webp",
  "embedded.bin"
];
const BITMAP_CACHE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bin"];

export type ReaderAssetRenderKind =
  | "bitmap"
  | "svg-vector"
  | "svg-raster-wrapper"
  | "unknown";

export type ReaderAssetRenderMode =
  | "bitmap-derivative"
  | "source-svg-image"
  | "original-svg"
  | "extracted-raster"
  | "bitmap"
  | "true-vector-svg";

export type ReaderAssetDetectedSourceType =
  | "svg"
  | "png"
  | "jpg"
  | "webp"
  | "unknown";

export type ReaderAssetRef = PlayerRuntimeImageAssetRef & {
  contentType?: string | null;
  derivatives?: ReaderAssetDerivative[];
  renderKind?: ReaderAssetRenderKind;
};

export type ReaderAssetDerivative = {
  cacheKey?: string;
  cacheVersion?: number | null;
  compressedBytes?: number | null;
  contentType: string;
  decodedBytesEstimate?: number | null;
  derivativeOf?: string | null;
  displayHeightDp?: number | null;
  displayScale?: number | null;
  displayWidthDp?: number | null;
  hash?: string;
  height?: number | null;
  renderKind: "bitmap";
  renderVersion?: string | null;
  scaleMargin?: number | null;
  sourceAssetId?: string | null;
  sourceHash?: string;
  sourceRenderKind?: "svg" | "bitmap" | "unknown";
  sourceStoragePath?: string | null;
  storagePath: string;
  targetPlatform?: "ios";
  url?: string;
  variantKey?: string | null;
  visibleContentBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  width?: number | null;
};

type ResolvedReaderAssetRef = ReaderAssetRef & {
  derivativeAssetExists?: boolean;
  derivativeAssetSelected?: boolean;
  fallbackReason?: string | null;
  originalStoragePath?: string;
  originalUrl?: string;
  selectedDerivativeStoragePath?: string | null;
  selectedDerivativeUrl?: string | null;
  sourceSvgFallbackUsed?: boolean;
};

export type ReaderCachedAsset = {
  assetId: string | null;
  cacheKey: string;
  localUri: string;
  renderKind: ReaderAssetRenderKind;
  renderMode: ReaderAssetRenderMode;
  role: ReaderAssetRef["role"];
  sourceUrl: string;
  storagePath: string;
  originalStoragePath: string | null;
  originalUrl: string | null;
  selectedDerivativeStoragePath: string | null;
  selectedDerivativeUrl: string | null;
  bytes: number;
  contentType: string | null;
  detectedSourceType: ReaderAssetDetectedSourceType;
  fileReady: boolean;
  fromCache: boolean;
  derivativeAssetExists: boolean;
  derivativeAssetSelected: boolean;
  sourceSvgFallbackUsed: boolean;
  downloadDurationMs: number | null;
  decodeWarmDurationMs: number | null;
  failureReason: string | null;
  imageRefHeight: number | null;
  imageRefReady: boolean;
  imageRefWidth: number | null;
  imagePrefetchResult: boolean | null;
  nativeImageRefReady: boolean;
  prefetchReady: boolean | null;
  renderReady: boolean;
  onLoadDurationMs: number | null;
  onLoadTimestamp: number | null;
  onDisplayDurationMs: number | null;
  onDisplayTimestamp: number | null;
  fallbackReason: string | null;
  warnings: string[];
  layoutMetrics: ReaderAssetLayoutMetrics | null;
  alphaMode: ReaderAssetAlphaMode;
};

export type ReaderAssetRenderDiagnostics = {
  assetId: string | null;
  characterId?: string | null;
  characterName?: string | null;
  emotionKey?: string | null;
  dressKey?: string | null;
  variantKey?: string | null;
  storagePath: string;
  sourceStoragePath: string;
  originalSvgStoragePath: string | null;
  sourceUrl: string;
  sourceContentType: string | null;
  sourceFileSize: number | null;
  iosDerivativeStoragePath: string | null;
  iosDerivativeUrl: string | null;
  iosDerivativeContentType: string | null;
  iosDerivativeCompressedBytes: number | null;
  iosDerivativeDecodedBytesEstimate: number | null;
  iosDerivativeWidth: number | null;
  iosDerivativeHeight: number | null;
  iosDerivativeHash: string | null;
  iosDerivativeRenderVersion: string | null;
  iosDerivativeVariantKey: string | null;
  selectedIosRenderMode: ReaderAssetRenderMode | "unknown";
  fallbackReason: string | null;
  localCachedUri: string | null;
  localCachedDerivativeUri: string | null;
  derivativeFileExists: boolean;
  derivativeLocalFileSize: number | null;
  fileReady: boolean;
  failureReason: string | null;
  imageRefHeight: number | null;
  imagePrefetchResult: boolean | null;
  imageRefReady: boolean;
  imageRefWidth: number | null;
  prefetchReady: boolean | null;
  renderReady: boolean;
  PORTRAIT_RENDER_MODE: ReaderAssetRenderMode | "unknown";
  derivativeAssetExists: boolean;
  derivativeAssetSelected: boolean;
  sourceSvgFallbackUsed: boolean;
  fileSize: number | null;
  cacheHit: boolean;
  cacheStatus: "hit" | "miss" | "unknown";
  downloadDurationMs: number | null;
  decodeWarmDurationMs: number | null;
  onLoadDurationMs: number | null;
  onLoadTimestamp: number | null;
  onDisplayDurationMs: number | null;
  onDisplayTimestamp: number | null;
  COLD_RENDER_ON_VISIBLE_PATH: boolean;
  contentType: string | null;
  renderKind: ReaderAssetRenderKind | "unknown";
  sceneReferences?: ReaderPortraitSceneReference[];
  presentationKeys?: string[];
  readinessByPresentationKey?: ReaderPortraitPresentationReadiness[];
  derivativeNetworkStatus?: ReaderDerivativeNetworkStatus | null;
};

export type ReaderPortraitSceneReference = {
  chapterId: string;
  chapterTitle?: string | null;
  sceneId: string;
  sceneTitle?: string | null;
  dialogueEntryId?: string | null;
  dialogueIndex?: number | null;
};

export type ReaderPortraitPresentationReadiness = {
  presentationKey: string;
  dialogueEntryId?: string | null;
  sceneId?: string | null;
  status: "idle" | "pending" | "ready" | "error" | "unknown";
  isImmediateNext?: boolean;
  message?: string | null;
};

export type ReaderPortraitRenderAuditEntry = {
  assetRef: ReaderAssetRef;
  characterId?: string | null;
  characterName?: string | null;
  emotionKey?: string | null;
  dressKey?: string | null;
  variantKey?: string | null;
  sceneReferences?: ReaderPortraitSceneReference[];
  presentationKeys?: string[];
  readinessByPresentationKey?: ReaderPortraitPresentationReadiness[];
};

export type ReaderAssetRenderModeDumpSummary = {
  totalCharacterPortraitsFound: number;
  bitmapDerivativeCount: number;
  missingDerivativeMetadataCount: number;
  derivativeUrlMissingOr404Count: number;
  svgFallbackCount: number;
  notLocallyCachedCount: number;
  notImageRefWarmedCount: number;
  coldVisibleRenderCount: number;
  imageRefReadyCount: number;
  renderModeCounts: Partial<Record<ReaderAssetRenderMode | "unknown", number>>;
};

export type ReaderDecodePriority = "high" | "medium" | "low";

export type ReaderDerivativeNetworkStatus = {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  contentLength: number | null;
  cacheControl: string | null;
  downloadDurationMs: number | null;
  errorMessage: string | null;
};

export type ReaderAssetRenderModeDump = {
  generatedAt: string;
  assets: ReaderAssetRenderDiagnostics[];
  summary: ReaderAssetRenderModeDumpSummary;
  runtime?: {
    manifestPath?: string | null;
    manifestGeneratedAt?: string | null;
    chapterId?: string | null;
    chapterGeneratedAt?: string | null;
    staleRuntimeJson?: boolean | null;
  };
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

export type ReaderAssetCacheClearResult = {
  status: "cleared";
  readerAssetCacheDirectory: string;
  expoDiskCacheCleared: boolean;
  expoMemoryCacheCleared: boolean;
};

type ReaderImagePreloadOptions = {
  waitForCompletion?: boolean;
};

type ReaderAssetReadyOptions = {
  forceRefresh?: boolean;
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

export type ReaderAssetAlphaMode = "alpha-safe" | "opaque" | "unknown";

type ReaderCacheMetadata = {
  alphaMode?: ReaderAssetAlphaMode;
  contentType?: string | null;
  detectedSourceType?: ReaderAssetDetectedSourceType;
  layoutMetrics?: ReaderAssetLayoutMetrics | null;
  renderKind?: ReaderAssetRenderKind;
  renderMode?: ReaderAssetRenderMode;
};

export type ReaderPortraitDebugRenderModeOverride = {
  assetId?: string | null;
  mode: "source-svg-image" | "original-svg" | "extracted-raster";
  storagePathIncludes?: string;
  urlIncludes?: string;
};

declare global {
  // Set in development from the simulator debugger to compare SVG vs extraction:
  // globalThis.__OCNOER_READER_PORTRAIT_RENDER_MODE_OVERRIDES = [{ storagePathIncludes: "ocnoer", mode: "original-svg" }]
  // eslint-disable-next-line no-var
  var __OCNOER_READER_PORTRAIT_RENDER_MODE_OVERRIDES:
    | ReaderPortraitDebugRenderModeOverride[]
    | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_DUMP_ASSET_RENDER_MODES:
    | (() => ReaderAssetRenderModeDump | Promise<ReaderAssetRenderModeDump>)
    | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_FORCE_ALL_CHARACTER_PORTRAITS_TO_LOCAL_TEST_BITMAP:
    | boolean
    | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_STRICT_BITMAP_DERIVATIVES: boolean | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_PERF_DIAGNOSTICS: boolean | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_DEVICE_SCALE: number | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_CLEAR_ASSET_CACHE:
    | (() => Promise<ReaderAssetCacheClearResult>)
    | undefined;
}

const FORCED_LOCAL_TEST_BITMAP_URI =
  "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const nativeImageRefCache = new Map<string, ImageRef>();
const inFlightNativeImageLoads = new Map<string, Promise<ImageRef | null>>();
const svgAstCache = new Map<string, JsxAST>();
const inFlightSvgAstLoads = new Map<string, Promise<JsxAST | null>>();
const cachedAssetsByUrl = new Map<string, ReaderCachedAsset>();
const cachedAssetsByKey = new Map<string, ReaderCachedAsset>();
const inFlightAssetLoads = new Map<string, Promise<ReaderCachedAsset>>();
let readerPortraitDebugRenderModeOverrides: ReaderPortraitDebugRenderModeOverride[] =
  [];
let readerStageMetrics = {
  stageWidth: DEFAULT_READER_STAGE_WIDTH,
  stageHeight: DEFAULT_READER_STAGE_HEIGHT,
  deviceScale: DEFAULT_READER_DEVICE_SCALE
};
let decodeSchedulerState = {
  textRevealing: false,
  transitioning: false
};

let activeDownloadCount = 0;
const queuedDownloads: Array<() => void> = [];
let activeDecodeCount = 0;
let decodeTaskSequence = 0;
const queuedDecodeTasks: Array<{
  id: number;
  priority: ReaderDecodePriority;
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  task: () => Promise<unknown>;
}> = [];

function isDevelopment() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function envFlag(name: string) {
  const env = globalThis as { process?: { env?: Record<string, string> } };
  const value = env.process?.env?.[name];

  return value === "1" || value === "true";
}

export function isReaderPerfDiagnosticsEnabled() {
  return (
    isDevelopment() ||
    Boolean(globalThis.__OCNOER_READER_PERF_DIAGNOSTICS) ||
    envFlag("EXPO_PUBLIC_OCNOER_READER_PERF_DIAGNOSTICS")
  );
}

function logAssetMetric(message: string, details?: Record<string, unknown>) {
  if (!isReaderPerfDiagnosticsEnabled()) {
    return;
  }

  if (details) {
    console.info(`[reader-assets] ${message}`, details);
    return;
  }

  console.info(`[reader-assets] ${message}`);
}

function logAssetWarning(message: string, details?: Record<string, unknown>) {
  if (!isReaderPerfDiagnosticsEnabled()) {
    return;
  }

  if (details) {
    console.warn(`[reader-assets] ${message}`, details);
    return;
  }

  console.warn(`[reader-assets] ${message}`);
}

export function setReaderPortraitDebugRenderModeOverrides(
  overrides: ReaderPortraitDebugRenderModeOverride[]
) {
  if (!isReaderPerfDiagnosticsEnabled()) {
    return;
  }

  readerPortraitDebugRenderModeOverrides = overrides;
}

function getReaderPortraitDebugRenderModeOverride(assetRef: ReaderAssetRef) {
  if (!isReaderPerfDiagnosticsEnabled() || assetRef.role !== "portrait") {
    return null;
  }

  const overrides = [
    ...readerPortraitDebugRenderModeOverrides,
    ...(globalThis.__OCNOER_READER_PORTRAIT_RENDER_MODE_OVERRIDES ?? [])
  ];

  return (
    overrides.find((override) => {
      if (override.assetId && override.assetId !== assetRef.assetId) {
        return false;
      }

      if (
        override.storagePathIncludes &&
        !assetRef.storagePath.includes(override.storagePathIncludes)
      ) {
        return false;
      }

      if (
        override.urlIncludes &&
        !assetRef.url.includes(override.urlIncludes)
      ) {
        return false;
      }

      return Boolean(
        override.assetId || override.storagePathIncludes || override.urlIncludes
      );
    })?.mode ?? null
  );
}

function isRemoteImageUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLocalUri(value: string) {
  return /^file:\/\//i.test(value);
}

function isDataUri(value: string) {
  return /^data:/i.test(value);
}

function shouldForceAllCharacterPortraitsToLocalTestBitmap() {
  return (
    isReaderPerfDiagnosticsEnabled() &&
    Boolean(
      globalThis.__OCNOER_READER_FORCE_ALL_CHARACTER_PORTRAITS_TO_LOCAL_TEST_BITMAP
    )
  );
}

function shouldUseStrictBitmapDerivatives() {
  return (
    isReaderPerfDiagnosticsEnabled() &&
    Boolean(globalThis.__OCNOER_READER_STRICT_BITMAP_DERIVATIVES)
  );
}

export function setReaderStageMetrics(input: {
  deviceScale?: number | null;
  stageHeight?: number | null;
  stageWidth?: number | null;
}) {
  readerStageMetrics = {
    stageWidth:
      typeof input.stageWidth === "number" && input.stageWidth > 0
        ? input.stageWidth
        : readerStageMetrics.stageWidth,
    stageHeight:
      typeof input.stageHeight === "number" && input.stageHeight > 0
        ? input.stageHeight
        : readerStageMetrics.stageHeight,
    deviceScale:
      typeof input.deviceScale === "number" && input.deviceScale > 0
        ? input.deviceScale
        : typeof globalThis.__OCNOER_READER_DEVICE_SCALE === "number"
          ? globalThis.__OCNOER_READER_DEVICE_SCALE
          : readerStageMetrics.deviceScale
  };
}

export function getReaderStageMetrics() {
  return readerStageMetrics;
}

export function setReaderDecodeSchedulerInteractionState(input: {
  textRevealing?: boolean;
  transitioning?: boolean;
}) {
  decodeSchedulerState = {
    textRevealing: input.textRevealing ?? decodeSchedulerState.textRevealing,
    transitioning: input.transitioning ?? decodeSchedulerState.transitioning
  };
  drainDecodeQueue();
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

function getDecodePriorityRank(priority: ReaderDecodePriority) {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

function shouldThrottleDecodePriority(priority: ReaderDecodePriority) {
  return (
    priority === "low" &&
    (decodeSchedulerState.textRevealing || decodeSchedulerState.transitioning)
  );
}

function drainDecodeQueue() {
  if (activeDecodeCount >= MAX_CONCURRENT_IMAGE_DECODE) {
    return;
  }

  const runnableTasks = queuedDecodeTasks
    .map((task, index) => ({
      index,
      task
    }))
    .filter((entry) => !shouldThrottleDecodePriority(entry.task.priority))
    .sort((left, right) => {
      const priorityDelta =
        getDecodePriorityRank(left.task.priority) -
        getDecodePriorityRank(right.task.priority);

      return priorityDelta === 0 ? left.task.id - right.task.id : priorityDelta;
    });
  const next = runnableTasks[0];

  if (!next) {
    return;
  }

  queuedDecodeTasks.splice(next.index, 1);
  activeDecodeCount += 1;
  void next.task
    .task()
    .then(next.task.resolve, next.task.reject)
    .finally(() => {
      activeDecodeCount -= 1;
      drainDecodeQueue();
    });
}

function runWithDecodeLimit<T>(
  priority: ReaderDecodePriority,
  task: () => Promise<T>
) {
  return new Promise<T>((resolve, reject) => {
    queuedDecodeTasks.push({
      id: decodeTaskSequence,
      priority,
      reject,
      resolve: resolve as (value: unknown) => void,
      task
    });
    decodeTaskSequence += 1;
    drainDecodeQueue();
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

function getResolvedBaseCacheKey(assetRef: ReaderAssetRef) {
  return normalizeCacheToken(
    `${assetRef.role}-${stableHash(
      assetRef.cacheKey || assetRef.storagePath || assetRef.url
    )}`
  );
}

function getRenderModeCacheToken(renderMode: ReaderAssetRenderMode) {
  switch (renderMode) {
    case "bitmap-derivative":
      return `bitmap-derivative-v${READER_ASSET_RENDER_CACHE_VERSION}`;
    case "source-svg-image":
      return `source-svg-image-v${READER_ASSET_RENDER_CACHE_VERSION}`;
    case "original-svg":
      return `source-svg-v${READER_ASSET_RENDER_CACHE_VERSION}`;
    case "extracted-raster":
      return `extracted-raster-v${READER_ASSET_RENDER_CACHE_VERSION}`;
    case "true-vector-svg":
      return `true-vector-svg-v${READER_ASSET_RENDER_CACHE_VERSION}`;
    case "bitmap":
      return `bitmap-v${READER_ASSET_RENDER_CACHE_VERSION}`;
  }
}

function getResolvedCacheKey(
  assetRef: ReaderAssetRef,
  renderMode: ReaderAssetRenderMode
) {
  return normalizeCacheToken(
    `${getResolvedBaseCacheKey(assetRef)}-${getRenderModeCacheToken(renderMode)}`
  );
}

export function getReaderAssetCacheKeyForRenderMode(
  assetRef: ReaderAssetRef,
  renderMode: ReaderAssetRenderMode
) {
  return getResolvedCacheKey(assetRef, renderMode);
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

function deleteCacheDirectoryIfPresent() {
  const directory = getCacheDirectory();

  try {
    if (directory.exists) {
      directory.delete();
    }
  } catch {
    logAssetWarning("unable to delete reader asset cache directory", {
      directory: directory.uri
    });
  }
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
  if (!metadata) {
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

function isLikelySvgAsset(assetRef: ReaderAssetRef) {
  return (
    assetRef.sourceRenderKind === "svg" ||
    ("originalSvgStoragePath" in assetRef &&
      typeof assetRef.originalSvgStoragePath === "string" &&
      assetRef.originalSvgStoragePath.length > 0) ||
    assetRef.renderKind === "svg-vector" ||
    assetRef.renderKind === "svg-raster-wrapper" ||
    extensionFromContentType(assetRef.contentType) === "svg" ||
    getPathExtension(assetRef.storagePath) === "svg" ||
    getPathExtension(assetRef.url) === "svg"
  );
}

function getPreferredCacheRenderMode(
  assetRef: ReaderAssetRef
): ReaderAssetRenderMode {
  const forcedPortraitRenderMode =
    getReaderPortraitDebugRenderModeOverride(assetRef);

  if (forcedPortraitRenderMode) {
    return forcedPortraitRenderMode;
  }

  if (
    assetRef.role === "portrait" &&
    Boolean((assetRef as ResolvedReaderAssetRef).derivativeAssetSelected)
  ) {
    return "bitmap-derivative";
  }

  if (assetRef.renderKind === "bitmap") {
    return "bitmap";
  }

  if (isLikelySvgAsset(assetRef) && assetRef.role === "portrait") {
    return "source-svg-image";
  }

  if (assetRef.renderKind === "svg-vector") {
    return "true-vector-svg";
  }

  if (isLikelySvgAsset(assetRef)) {
    return "source-svg-image";
  }

  return "bitmap";
}

function uniqueRenderModes(
  renderModes: ReaderAssetRenderMode[]
): ReaderAssetRenderMode[] {
  return Array.from(new Set(renderModes));
}

function getCacheRenderModeCandidates(assetRef: ReaderAssetRef) {
  const preferred = getPreferredCacheRenderMode(assetRef);

  if (
    assetRef.role === "portrait" &&
    isLikelySvgAsset(assetRef) &&
    preferred !== "original-svg" &&
    preferred !== "extracted-raster"
  ) {
    return uniqueRenderModes([preferred, "source-svg-image", "bitmap"]);
  }

  return uniqueRenderModes([
    preferred,
    "source-svg-image",
    "original-svg",
    "true-vector-svg",
    "extracted-raster",
    "bitmap"
  ]);
}

function getCacheExtensionsForRenderMode(renderMode: ReaderAssetRenderMode) {
  if (
    renderMode === "source-svg-image" ||
    renderMode === "original-svg" ||
    renderMode === "true-vector-svg"
  ) {
    return SOURCE_SVG_CACHE_EXTENSIONS;
  }

  if (renderMode === "extracted-raster") {
    return EXTRACTED_RASTER_CACHE_EXTENSIONS;
  }

  return BITMAP_CACHE_EXTENSIONS;
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

function getDetectedSourceTypeFromExtension(
  extension: string | null
): ReaderAssetDetectedSourceType {
  if (extension === "svg") {
    return "svg";
  }

  if (extension === "png") {
    return "png";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "jpg";
  }

  if (extension === "webp") {
    return "webp";
  }

  return "unknown";
}

function isAlphaSafeBitmapContentType(contentType: string | null | undefined) {
  const normalizedContentType = contentType?.toLowerCase() ?? "";

  return (
    normalizedContentType.includes("image/png") ||
    normalizedContentType.includes("image/webp")
  );
}

function isIosBitmapDerivative(derivative: ReaderAssetDerivative) {
  return (
    derivative.renderKind === "bitmap" &&
    (derivative.targetPlatform == null || derivative.targetPlatform === "ios")
  );
}

function hasCompleteIosDerivativeMetadata(
  derivative: ReaderAssetDerivative | null | undefined
) {
  return Boolean(
    derivative &&
    derivative.storagePath.length > 0 &&
    typeof derivative.url === "string" &&
    derivative.url.length > 0 &&
    isAlphaSafeBitmapContentType(derivative.contentType) &&
    typeof derivative.hash === "string" &&
    derivative.hash.length > 0 &&
    typeof derivative.width === "number" &&
    derivative.width > 0 &&
    typeof derivative.height === "number" &&
    derivative.height > 0
  );
}

function getIosBitmapDerivativeCandidates(assetRef: ReaderAssetRef) {
  return (
    assetRef.derivatives?.filter(
      (derivative) =>
        isIosBitmapDerivative(derivative) &&
        typeof derivative.url === "string" &&
        derivative.url.length > 0 &&
        isAlphaSafeBitmapContentType(derivative.contentType) &&
        typeof derivative.width === "number" &&
        derivative.width > 0 &&
        typeof derivative.height === "number" &&
        derivative.height > 0
    ) ?? []
  );
}

function getDerivativeArea(derivative: ReaderAssetDerivative) {
  return (derivative.width ?? 0) * (derivative.height ?? 0);
}

function getLargestDerivative(
  derivatives: ReaderAssetDerivative[]
): ReaderAssetDerivative | null {
  return (
    [...derivatives].sort(
      (left, right) => getDerivativeArea(right) - getDerivativeArea(left)
    )[0] ?? null
  );
}

function getPortraitDerivativeSelectionTarget(input: {
  assetRef: ReaderAssetRef;
  derivatives: ReaderAssetDerivative[];
}) {
  const largestDerivative = getLargestDerivative(input.derivatives);
  const side =
    input.assetRef.stagePlacement === "right" ||
    input.assetRef.stagePlacement === "left"
      ? input.assetRef.stagePlacement
      : "left";
  const layout = resolveNativeReaderPortraitLayout({
    stageWidth: readerStageMetrics.stageWidth,
    stageHeight: readerStageMetrics.stageHeight,
    side,
    assetWidth: largestDerivative?.width,
    assetHeight: largestDerivative?.height
  });

  return {
    deviceScale: readerStageMetrics.deviceScale,
    displayHeightDp: layout.height,
    displayWidthDp: layout.width,
    requiredHeightPx: Math.ceil(
      layout.height *
        readerStageMetrics.deviceScale *
        READER_PORTRAIT_VARIANT_SELECTION_MARGIN
    ),
    requiredWidthPx: Math.ceil(
      layout.width *
        readerStageMetrics.deviceScale *
        READER_PORTRAIT_VARIANT_SELECTION_MARGIN
    ),
    stageHeight: readerStageMetrics.stageHeight,
    stageWidth: readerStageMetrics.stageWidth
  };
}

export function selectReaderAssetDerivativeVariant(
  assetRef: ReaderAssetRef,
  metrics = readerStageMetrics
) {
  const previousMetrics = readerStageMetrics;

  readerStageMetrics = metrics;

  try {
    const derivatives = getIosBitmapDerivativeCandidates(assetRef);
    const target = getPortraitDerivativeSelectionTarget({
      assetRef,
      derivatives
    });

    if (derivatives.length === 0) {
      return {
        derivative: null,
        target
      };
    }

    const sortedDerivatives = [...derivatives].sort((left, right) => {
      const areaDelta = getDerivativeArea(left) - getDerivativeArea(right);

      if (areaDelta !== 0) {
        return areaDelta;
      }

      return (left.variantKey ?? "").localeCompare(right.variantKey ?? "");
    });
    const sufficientDerivative =
      sortedDerivatives.find(
        (derivative) =>
          (derivative.width ?? 0) >= target.requiredWidthPx &&
          (derivative.height ?? 0) >= target.requiredHeightPx
      ) ?? null;

    return {
      derivative: sufficientDerivative ?? sortedDerivatives.at(-1) ?? null,
      target
    };
  } finally {
    readerStageMetrics = previousMetrics;
  }
}

function getPreferredReaderAssetDerivative(assetRef: ReaderAssetRef) {
  return selectReaderAssetDerivativeVariant(assetRef).derivative;
}

export function getSelectedReaderAssetDerivativeMetadata(
  assetRef: ReaderAssetRef
) {
  const selection = selectReaderAssetDerivativeVariant(assetRef);
  const derivative = selection.derivative;

  return derivative
    ? {
        cacheVersion: derivative.cacheVersion ?? null,
        compressedBytes: derivative.compressedBytes ?? null,
        contentType: derivative.contentType,
        decodedBytesEstimate: derivative.decodedBytesEstimate ?? null,
        hash: derivative.hash ?? null,
        height: derivative.height ?? null,
        renderVersion: derivative.renderVersion ?? null,
        requiredHeightPx: selection.target.requiredHeightPx,
        requiredWidthPx: selection.target.requiredWidthPx,
        stageHeight: selection.target.stageHeight,
        stageWidth: selection.target.stageWidth,
        storagePath: derivative.storagePath,
        variantKey: derivative.variantKey ?? null,
        width: derivative.width ?? null
      }
    : null;
}

function hasReaderAssetBitmapDerivative(assetRef: ReaderAssetRef) {
  return Boolean(
    assetRef.derivatives?.some(
      (derivative) =>
        isIosBitmapDerivative(derivative) &&
        typeof derivative.url === "string" &&
        derivative.url.length > 0
    )
  );
}

function getPortraitDerivativeFallbackReason(input: {
  assetRef: ReaderAssetRef;
  derivativeAssetExists: boolean;
  forcedPortraitRenderMode: ReaderAssetRenderMode | null;
  selectedDerivative: ReaderAssetDerivative | null;
}) {
  if (input.assetRef.role !== "portrait" || !isLikelySvgAsset(input.assetRef)) {
    return null;
  }

  if (input.forcedPortraitRenderMode) {
    return `dev-render-mode-override:${input.forcedPortraitRenderMode}`;
  }

  if (!input.derivativeAssetExists) {
    return "missing-ios-bitmap-derivative-metadata";
  }

  if (!input.selectedDerivative) {
    return "no-alpha-safe-ios-bitmap-derivative";
  }

  if (!hasCompleteIosDerivativeMetadata(input.selectedDerivative)) {
    return "incomplete-ios-bitmap-derivative-metadata";
  }

  return null;
}

function getForcedLocalTestBitmapAssetRef(
  assetRef: ReaderAssetRef
): ResolvedReaderAssetRef {
  return {
    ...assetRef,
    url: FORCED_LOCAL_TEST_BITMAP_URI,
    storagePath: "__ocnoer_reader_forced_local_test_bitmap.reader.webp",
    cacheKey: `${assetRef.cacheKey}:forced-local-test-bitmap`,
    contentType: "image/webp",
    renderKind: "bitmap",
    derivatives: [],
    derivativeAssetExists: true,
    derivativeAssetSelected: true,
    fallbackReason: null,
    originalStoragePath: assetRef.storagePath,
    originalUrl: assetRef.url,
    selectedDerivativeStoragePath:
      "__ocnoer_reader_forced_local_test_bitmap.reader.webp",
    selectedDerivativeUrl: FORCED_LOCAL_TEST_BITMAP_URI,
    sourceRenderKind: "bitmap",
    sourceSvgFallbackUsed: false
  };
}

function resolveReaderAssetRefForVisibleRender(
  assetRef: ReaderAssetRef
): ResolvedReaderAssetRef {
  if (
    assetRef.role === "portrait" &&
    shouldForceAllCharacterPortraitsToLocalTestBitmap()
  ) {
    return getForcedLocalTestBitmapAssetRef(assetRef);
  }

  const forcedPortraitRenderMode =
    getReaderPortraitDebugRenderModeOverride(assetRef);
  const derivativeAssetExists = hasReaderAssetBitmapDerivative(assetRef);
  const derivative =
    forcedPortraitRenderMode == null
      ? getPreferredReaderAssetDerivative(assetRef)
      : null;
  const fallbackReason = getPortraitDerivativeFallbackReason({
    assetRef,
    derivativeAssetExists,
    forcedPortraitRenderMode,
    selectedDerivative: derivative
  });

  if (!derivative?.url) {
    const sourceSvgFallbackUsed =
      assetRef.role === "portrait" && isLikelySvgAsset(assetRef);

    if (sourceSvgFallbackUsed) {
      const warningDetails = {
        PORTRAIT_RENDER_MODE: forcedPortraitRenderMode ?? "source-svg-image",
        assetId: assetRef.assetId ?? null,
        derivativeAssetExists,
        fallbackReason,
        forcedPortraitRenderMode,
        originalSvgStoragePath:
          assetRef.originalSvgStoragePath ?? assetRef.storagePath,
        storagePath: assetRef.storagePath,
        url: assetRef.url
      };

      if (shouldUseStrictBitmapDerivatives()) {
        throw new Error(
          `Strict bitmap derivatives blocked portrait ${assetRef.storagePath}: ${fallbackReason ?? "unknown-fallback"}`
        );
      }

      logAssetWarning(
        "iOS character portrait is falling back to source SVG because no usable bitmap derivative was selected",
        warningDetails
      );
    }

    return {
      ...assetRef,
      derivativeAssetExists,
      derivativeAssetSelected: false,
      fallbackReason,
      selectedDerivativeStoragePath: null,
      selectedDerivativeUrl: null,
      sourceSvgFallbackUsed
    };
  }

  logAssetMetric("portrait derivative variant selected", {
    assetId: assetRef.assetId ?? null,
    compressedBytes: derivative.compressedBytes ?? null,
    decodedBytesEstimate:
      derivative.decodedBytesEstimate ??
      (typeof derivative.width === "number" &&
      typeof derivative.height === "number"
        ? derivative.width * derivative.height * 4
        : null),
    deviceScale: readerStageMetrics.deviceScale,
    height: derivative.height ?? null,
    renderVersion: derivative.renderVersion ?? null,
    stageHeight: readerStageMetrics.stageHeight,
    stageWidth: readerStageMetrics.stageWidth,
    storagePath: derivative.storagePath,
    variantKey: derivative.variantKey ?? null,
    width: derivative.width ?? null
  });

  return {
    ...assetRef,
    url: derivative.url,
    storagePath: derivative.storagePath,
    cacheKey:
      derivative.cacheKey ??
      `${assetRef.cacheKey}:derivative:${derivative.renderVersion ?? "unknown-render"}:${derivative.hash ?? derivative.storagePath}`,
    assetId: assetRef.assetId,
    contentType: derivative.contentType,
    renderKind: derivative.renderKind,
    derivatives: [],
    derivativeAssetExists,
    derivativeAssetSelected: true,
    fallbackReason,
    originalStoragePath: assetRef.storagePath,
    originalUrl: assetRef.url,
    selectedDerivativeStoragePath: derivative.storagePath,
    selectedDerivativeUrl: derivative.url,
    sourceRenderKind: "bitmap",
    sourceSvgFallbackUsed: false
  };
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

function bytesContainAscii(bytes: Uint8Array, value: string, startIndex = 0) {
  const encodedValue = Array.from(value).map((char) => char.charCodeAt(0));

  for (
    let index = startIndex;
    index <= bytes.length - encodedValue.length;
    index += 1
  ) {
    if (
      encodedValue.every(
        (charCode, offset) => bytes[index + offset] === charCode
      )
    ) {
      return true;
    }
  }

  return false;
}

function getPngAlphaMode(bytes: Uint8Array): ReaderAssetAlphaMode {
  if (bytes.length < 26) {
    return "unknown";
  }

  const colorType = bytes[25];

  if (colorType === 4 || colorType === 6) {
    return "alpha-safe";
  }

  return bytesContainAscii(bytes, "tRNS", 8) ? "alpha-safe" : "opaque";
}

function getWebpAlphaMode(bytes: Uint8Array): ReaderAssetAlphaMode {
  if (
    bytes.length > 21 &&
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    bytes[15] === 0x58
  ) {
    return (bytes[20] ?? 0) & 0x10 ? "alpha-safe" : "opaque";
  }

  return "unknown";
}

function getRasterFileInfoFromBytes(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
}) {
  const extension = extensionFromBytes(input.bytes);

  if (extension === "png") {
    return {
      extension: "png",
      mimeType: "image/png",
      alphaMode: getPngAlphaMode(input.bytes)
    } as const;
  }

  if (extension === "webp") {
    return {
      extension: "webp",
      mimeType: "image/webp",
      alphaMode: getWebpAlphaMode(input.bytes)
    } as const;
  }

  if (extension === "jpg") {
    return {
      extension: "jpg",
      mimeType: "image/jpeg",
      alphaMode: "opaque"
    } as const;
  }

  return {
    extension: extensionFromContentType(input.declaredMimeType) ?? "bin",
    mimeType: input.declaredMimeType,
    alphaMode:
      input.declaredMimeType === "image/png" ||
      input.declaredMimeType === "image/webp"
        ? "alpha-safe"
        : "unknown"
  } as const;
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function getWrittenFileByteIdentity(file: File, expectedBytes: Uint8Array) {
  try {
    return bytesEqual(file.bytesSync(), expectedBytes);
  } catch {
    return false;
  }
}

function getDataUriByteSize(uri: string) {
  const base64Match = uri.match(/^data:[^,]*;base64,(.*)$/i);

  if (!base64Match?.[1]) {
    return uri.length;
  }

  const normalized = base64Match[1].replace(/\s/g, "");
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function getRecordOriginalStoragePath(assetRef: ReaderAssetRef) {
  const resolvedAssetRef = assetRef as ResolvedReaderAssetRef;

  return (
    resolvedAssetRef.originalStoragePath ??
    (assetRef.sourceRenderKind === "svg" ? assetRef.storagePath : null)
  );
}

function getRecordOriginalUrl(assetRef: ReaderAssetRef) {
  const resolvedAssetRef = assetRef as ResolvedReaderAssetRef;

  return (
    resolvedAssetRef.originalUrl ??
    (assetRef.sourceRenderKind === "svg" ? assetRef.url : null)
  );
}

function createAssetRecord(input: {
  assetRef: ReaderAssetRef;
  cacheKey: string;
  file: File;
  renderKind: ReaderAssetRenderKind;
  renderMode: ReaderAssetRenderMode;
  contentType: string | null;
  detectedSourceType?: ReaderAssetDetectedSourceType;
  fromCache: boolean;
  layoutMetrics?: ReaderAssetLayoutMetrics | null;
  alphaMode?: ReaderAssetAlphaMode;
  sourceUrl?: string;
  downloadDurationMs?: number | null;
  warnings?: string[];
}): ReaderCachedAsset {
  const sourceUrl = input.sourceUrl ?? input.assetRef.url;
  const resolvedAssetRef = input.assetRef as ResolvedReaderAssetRef;
  const originalStoragePath = getRecordOriginalStoragePath(input.assetRef);
  const originalUrl = getRecordOriginalUrl(input.assetRef);
  const derivativeAssetSelected = Boolean(
    resolvedAssetRef.derivativeAssetSelected
  );
  const record: ReaderCachedAsset = {
    assetId: input.assetRef.assetId ?? null,
    cacheKey: input.cacheKey,
    localUri: input.file.uri,
    renderKind: input.renderKind,
    renderMode: input.renderMode,
    role: input.assetRef.role,
    sourceUrl,
    storagePath: input.assetRef.storagePath,
    originalStoragePath,
    originalUrl,
    selectedDerivativeStoragePath:
      resolvedAssetRef.selectedDerivativeStoragePath ??
      (derivativeAssetSelected ? input.assetRef.storagePath : null),
    selectedDerivativeUrl:
      resolvedAssetRef.selectedDerivativeUrl ??
      (derivativeAssetSelected ? input.assetRef.url : null),
    bytes: getFileSize(input.file),
    contentType: input.contentType,
    detectedSourceType: input.detectedSourceType ?? "unknown",
    fileReady: isReadyFile(input.file),
    fromCache: input.fromCache,
    derivativeAssetExists: Boolean(resolvedAssetRef.derivativeAssetExists),
    derivativeAssetSelected,
    sourceSvgFallbackUsed:
      Boolean(resolvedAssetRef.sourceSvgFallbackUsed) ||
      (input.assetRef.role === "portrait" &&
        input.renderMode === "source-svg-image" &&
        isLikelySvgAsset(input.assetRef) &&
        !derivativeAssetSelected),
    downloadDurationMs: input.downloadDurationMs ?? null,
    decodeWarmDurationMs: null,
    failureReason: null,
    imageRefHeight: null,
    imageRefReady: false,
    imageRefWidth: null,
    imagePrefetchResult: null,
    nativeImageRefReady: false,
    prefetchReady: null,
    renderReady: false,
    onLoadDurationMs: null,
    onLoadTimestamp: null,
    onDisplayDurationMs: null,
    onDisplayTimestamp: null,
    fallbackReason: resolvedAssetRef.fallbackReason ?? null,
    warnings: input.warnings ?? [],
    layoutMetrics: input.layoutMetrics ?? null,
    alphaMode: input.alphaMode ?? "unknown"
  };

  if (!input.fromCache) {
    writeCacheMetadata(input.cacheKey, {
      layoutMetrics: record.layoutMetrics,
      alphaMode: record.alphaMode,
      contentType: record.contentType,
      detectedSourceType: record.detectedSourceType,
      renderKind: record.renderKind,
      renderMode: record.renderMode
    });
  }

  cachedAssetsByUrl.set(sourceUrl, record);
  cachedAssetsByUrl.set(input.assetRef.url, record);
  cachedAssetsByKey.set(input.cacheKey, record);
  return record;
}

function createInlineAssetRecord(input: {
  assetRef: ReaderAssetRef;
  cacheKey: string;
  renderKind: ReaderAssetRenderKind;
  renderMode: ReaderAssetRenderMode;
  contentType: string | null;
  detectedSourceType?: ReaderAssetDetectedSourceType;
  sourceUrl?: string;
}) {
  const sourceUrl = input.sourceUrl ?? input.assetRef.url;
  const resolvedAssetRef = input.assetRef as ResolvedReaderAssetRef;
  const derivativeAssetSelected = Boolean(
    resolvedAssetRef.derivativeAssetSelected
  );
  const record: ReaderCachedAsset = {
    assetId: input.assetRef.assetId ?? null,
    cacheKey: input.cacheKey,
    localUri: input.assetRef.url,
    renderKind: input.renderKind,
    renderMode: input.renderMode,
    role: input.assetRef.role,
    sourceUrl,
    storagePath: input.assetRef.storagePath,
    originalStoragePath: getRecordOriginalStoragePath(input.assetRef),
    originalUrl: getRecordOriginalUrl(input.assetRef),
    selectedDerivativeStoragePath:
      resolvedAssetRef.selectedDerivativeStoragePath ??
      (derivativeAssetSelected ? input.assetRef.storagePath : null),
    selectedDerivativeUrl:
      resolvedAssetRef.selectedDerivativeUrl ??
      (derivativeAssetSelected ? input.assetRef.url : null),
    bytes: getDataUriByteSize(input.assetRef.url),
    contentType: input.contentType,
    detectedSourceType: input.detectedSourceType ?? "webp",
    fileReady: true,
    fromCache: true,
    derivativeAssetExists: Boolean(resolvedAssetRef.derivativeAssetExists),
    derivativeAssetSelected,
    sourceSvgFallbackUsed: Boolean(resolvedAssetRef.sourceSvgFallbackUsed),
    downloadDurationMs: 0,
    decodeWarmDurationMs: null,
    failureReason: null,
    imageRefHeight: null,
    imageRefReady: false,
    imageRefWidth: null,
    imagePrefetchResult: null,
    nativeImageRefReady: false,
    prefetchReady: null,
    renderReady: false,
    onLoadDurationMs: null,
    onLoadTimestamp: null,
    onDisplayDurationMs: null,
    onDisplayTimestamp: null,
    fallbackReason: resolvedAssetRef.fallbackReason ?? null,
    warnings: [],
    layoutMetrics: null,
    alphaMode: "alpha-safe"
  };

  cachedAssetsByUrl.set(sourceUrl, record);
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

  if (isDataUri(record.localUri) || isReadyFile(new File(record.localUri))) {
    return record;
  }

  cachedAssetsByUrl.delete(url);
  cachedAssetsByUrl.delete(record.sourceUrl);
  cachedAssetsByKey.delete(record.cacheKey);
  return null;
}

function clearNativeImageRefCacheForRecord(record: ReaderCachedAsset) {
  const urls = [
    record.sourceUrl,
    record.originalUrl,
    record.selectedDerivativeUrl
  ].filter((url): url is string => Boolean(url));

  urls.forEach((url) => {
    nativeImageRefCache.delete(url);
    inFlightNativeImageLoads.delete(url);
  });
}

function isColdRenderOnVisiblePath(record: ReaderCachedAsset) {
  if (!isReadyFile(new File(record.localUri))) {
    return !isDataUri(record.localUri);
  }

  if (
    record.renderMode === "original-svg" ||
    record.renderMode === "true-vector-svg"
  ) {
    return !svgAstCache.has(record.sourceUrl);
  }

  return !nativeImageRefCache.has(record.sourceUrl);
}

function getFileExistsForUri(uri: string | null) {
  if (!uri) {
    return false;
  }

  if (isDataUri(uri)) {
    return true;
  }

  return isReadyFile(new File(uri));
}

function getLocalFileSizeForUri(uri: string | null) {
  if (!uri) {
    return null;
  }

  if (isDataUri(uri)) {
    return getDataUriByteSize(uri);
  }

  const file = new File(uri);

  return getFileSize(file);
}

function getPreferredDerivativeDiagnostics(assetRef: ReaderAssetRef) {
  const derivative = getPreferredReaderAssetDerivative(assetRef);

  return {
    iosDerivativeStoragePath:
      derivative?.storagePath ?? assetRef.iosDerivativeStoragePath ?? null,
    iosDerivativeUrl: derivative?.url ?? assetRef.iosDerivativeUrl ?? null,
    iosDerivativeContentType:
      derivative?.contentType ?? assetRef.iosDerivativeContentType ?? null,
    iosDerivativeCompressedBytes: derivative?.compressedBytes ?? null,
    iosDerivativeDecodedBytesEstimate:
      derivative?.decodedBytesEstimate ??
      (typeof derivative?.width === "number" &&
      typeof derivative?.height === "number"
        ? derivative.width * derivative.height * 4
        : null),
    iosDerivativeWidth:
      derivative?.width ?? assetRef.iosDerivativeWidth ?? null,
    iosDerivativeHeight:
      derivative?.height ?? assetRef.iosDerivativeHeight ?? null,
    iosDerivativeHash: derivative?.hash ?? assetRef.iosDerivativeHash ?? null,
    iosDerivativeRenderVersion: derivative?.renderVersion ?? null,
    iosDerivativeVariantKey: derivative?.variantKey ?? null,
    hasCompleteMetadata:
      hasCompleteIosDerivativeMetadata(derivative) ||
      Boolean(
        assetRef.iosDerivativeStoragePath &&
        assetRef.iosDerivativeUrl &&
        assetRef.iosDerivativeContentType &&
        isAlphaSafeBitmapContentType(assetRef.iosDerivativeContentType) &&
        assetRef.iosDerivativeHash &&
        typeof assetRef.iosDerivativeWidth === "number" &&
        assetRef.iosDerivativeWidth > 0 &&
        typeof assetRef.iosDerivativeHeight === "number" &&
        assetRef.iosDerivativeHeight > 0
      )
  };
}

function getDiagnosticsForRecord(
  record: ReaderCachedAsset,
  auditEntry?: ReaderPortraitRenderAuditEntry
): ReaderAssetRenderDiagnostics {
  const assetRef = auditEntry?.assetRef;
  const derivativeDiagnostics = assetRef
    ? getPreferredDerivativeDiagnostics(assetRef)
    : {
        iosDerivativeStoragePath: record.selectedDerivativeStoragePath,
        iosDerivativeUrl: record.selectedDerivativeUrl,
        iosDerivativeContentType: null,
        iosDerivativeCompressedBytes: null,
        iosDerivativeDecodedBytesEstimate: null,
        iosDerivativeWidth: null,
        iosDerivativeHeight: null,
        iosDerivativeHash: null,
        iosDerivativeRenderVersion: null,
        iosDerivativeVariantKey: null,
        hasCompleteMetadata: record.derivativeAssetSelected
      };
  return {
    assetId: record.assetId,
    characterId: auditEntry?.characterId ?? record.assetId,
    characterName: auditEntry?.characterName ?? null,
    emotionKey: auditEntry?.emotionKey ?? null,
    dressKey: auditEntry?.dressKey ?? null,
    variantKey: auditEntry?.variantKey ?? null,
    storagePath: record.storagePath,
    sourceStoragePath:
      record.originalStoragePath ?? assetRef?.storagePath ?? record.storagePath,
    originalSvgStoragePath: record.originalStoragePath,
    sourceUrl: record.sourceUrl,
    sourceContentType: assetRef?.contentType ?? null,
    sourceFileSize: null,
    iosDerivativeStoragePath: derivativeDiagnostics.iosDerivativeStoragePath,
    iosDerivativeUrl: derivativeDiagnostics.iosDerivativeUrl,
    iosDerivativeContentType: derivativeDiagnostics.iosDerivativeContentType,
    iosDerivativeCompressedBytes:
      derivativeDiagnostics.iosDerivativeCompressedBytes,
    iosDerivativeDecodedBytesEstimate:
      derivativeDiagnostics.iosDerivativeDecodedBytesEstimate,
    iosDerivativeWidth: derivativeDiagnostics.iosDerivativeWidth,
    iosDerivativeHeight: derivativeDiagnostics.iosDerivativeHeight,
    iosDerivativeHash: derivativeDiagnostics.iosDerivativeHash,
    iosDerivativeRenderVersion:
      derivativeDiagnostics.iosDerivativeRenderVersion,
    iosDerivativeVariantKey: derivativeDiagnostics.iosDerivativeVariantKey,
    selectedIosRenderMode: record.renderMode,
    fallbackReason: record.fallbackReason,
    localCachedUri: record.localUri,
    localCachedDerivativeUri: record.derivativeAssetSelected
      ? record.localUri
      : null,
    derivativeFileExists: record.derivativeAssetSelected
      ? getFileExistsForUri(record.localUri)
      : false,
    derivativeLocalFileSize: record.derivativeAssetSelected
      ? getLocalFileSizeForUri(record.localUri)
      : null,
    fileReady: record.fileReady,
    failureReason: record.failureReason,
    imageRefHeight: record.imageRefHeight,
    imagePrefetchResult: record.imagePrefetchResult,
    imageRefReady: nativeImageRefCache.has(record.sourceUrl),
    imageRefWidth: record.imageRefWidth,
    prefetchReady: record.prefetchReady,
    renderReady: record.renderReady,
    PORTRAIT_RENDER_MODE: record.renderMode,
    derivativeAssetExists: record.derivativeAssetExists,
    derivativeAssetSelected: record.derivativeAssetSelected,
    sourceSvgFallbackUsed: record.sourceSvgFallbackUsed,
    fileSize: record.bytes,
    cacheHit: record.fromCache,
    cacheStatus: record.fromCache ? "hit" : "miss",
    downloadDurationMs: record.downloadDurationMs,
    decodeWarmDurationMs: record.decodeWarmDurationMs,
    onLoadDurationMs: record.onLoadDurationMs,
    onLoadTimestamp: record.onLoadTimestamp,
    onDisplayDurationMs: record.onDisplayDurationMs,
    onDisplayTimestamp: record.onDisplayTimestamp,
    COLD_RENDER_ON_VISIBLE_PATH: isColdRenderOnVisiblePath(record),
    contentType: record.contentType,
    renderKind: record.renderKind,
    sceneReferences: auditEntry?.sceneReferences ?? [],
    presentationKeys: auditEntry?.presentationKeys ?? [],
    readinessByPresentationKey: auditEntry?.readinessByPresentationKey ?? [],
    derivativeNetworkStatus: null
  };
}

export function getReaderAssetRenderDiagnostics(
  assetRefOrUrl: ReaderAssetRef | string
): ReaderAssetRenderDiagnostics | null {
  const record = getCachedRecord(assetRefOrUrl);

  return record ? getDiagnosticsForRecord(record) : null;
}

export function recordReaderAssetVisibleTiming(input: {
  durationMs: number;
  event: "onLoad" | "onDisplay";
  imageUrl: string;
  label?: string;
}) {
  const record = getCachedRecord(input.imageUrl);

  if (!record) {
    return;
  }

  if (input.event === "onLoad") {
    record.onLoadDurationMs = input.durationMs;
    record.onLoadTimestamp = Date.now();
  } else {
    record.onDisplayDurationMs = input.durationMs;
    record.onDisplayTimestamp = Date.now();
  }

  if (record.role !== "portrait") {
    return;
  }

  logAssetMetric(
    input.event === "onLoad" ? "portrait image loaded" : "portrait displayed",
    {
      ...getDiagnosticsForRecord(record),
      label: input.label ?? null
    }
  );
}

function getUncachedAssetDiagnostics(
  assetRef: ReaderAssetRef,
  auditEntry?: ReaderPortraitRenderAuditEntry
): ReaderAssetRenderDiagnostics {
  const selectedDerivative = getPreferredReaderAssetDerivative(assetRef);
  const renderAssetRef = resolveReaderAssetRefForVisibleRender(assetRef);
  const renderMode = getPreferredCacheRenderMode(renderAssetRef);
  const derivativeDiagnostics = getPreferredDerivativeDiagnostics(assetRef);
  const fallbackReason =
    (renderAssetRef as ResolvedReaderAssetRef).fallbackReason ??
    getPortraitDerivativeFallbackReason({
      assetRef,
      derivativeAssetExists: hasReaderAssetBitmapDerivative(assetRef),
      forcedPortraitRenderMode:
        getReaderPortraitDebugRenderModeOverride(assetRef),
      selectedDerivative
    });

  return {
    assetId: assetRef.assetId ?? null,
    characterId: auditEntry?.characterId ?? assetRef.assetId ?? null,
    characterName: auditEntry?.characterName ?? null,
    emotionKey: auditEntry?.emotionKey ?? null,
    dressKey: auditEntry?.dressKey ?? null,
    variantKey: auditEntry?.variantKey ?? null,
    storagePath: renderAssetRef.storagePath,
    sourceStoragePath: assetRef.storagePath,
    originalSvgStoragePath:
      renderAssetRef.originalStoragePath ??
      (assetRef.sourceRenderKind === "svg" ? assetRef.storagePath : null),
    sourceUrl: assetRef.url,
    sourceContentType: assetRef.contentType ?? null,
    sourceFileSize: null,
    iosDerivativeStoragePath: derivativeDiagnostics.iosDerivativeStoragePath,
    iosDerivativeUrl: derivativeDiagnostics.iosDerivativeUrl,
    iosDerivativeContentType: derivativeDiagnostics.iosDerivativeContentType,
    iosDerivativeCompressedBytes:
      derivativeDiagnostics.iosDerivativeCompressedBytes,
    iosDerivativeDecodedBytesEstimate:
      derivativeDiagnostics.iosDerivativeDecodedBytesEstimate,
    iosDerivativeWidth: derivativeDiagnostics.iosDerivativeWidth,
    iosDerivativeHeight: derivativeDiagnostics.iosDerivativeHeight,
    iosDerivativeHash: derivativeDiagnostics.iosDerivativeHash,
    iosDerivativeRenderVersion:
      derivativeDiagnostics.iosDerivativeRenderVersion,
    iosDerivativeVariantKey: derivativeDiagnostics.iosDerivativeVariantKey,
    selectedIosRenderMode: renderMode,
    fallbackReason,
    localCachedUri: null,
    localCachedDerivativeUri: null,
    derivativeFileExists: false,
    derivativeLocalFileSize: null,
    fileReady: false,
    failureReason: null,
    imageRefHeight: null,
    imagePrefetchResult: null,
    imageRefReady: false,
    imageRefWidth: null,
    prefetchReady: null,
    renderReady: false,
    PORTRAIT_RENDER_MODE: renderMode,
    derivativeAssetExists: hasReaderAssetBitmapDerivative(assetRef),
    derivativeAssetSelected: Boolean(selectedDerivative),
    sourceSvgFallbackUsed: Boolean(renderAssetRef.sourceSvgFallbackUsed),
    fileSize: null,
    cacheHit: false,
    cacheStatus: "unknown",
    downloadDurationMs: null,
    decodeWarmDurationMs: null,
    onLoadDurationMs: null,
    onLoadTimestamp: null,
    onDisplayDurationMs: null,
    onDisplayTimestamp: null,
    COLD_RENDER_ON_VISIBLE_PATH: true,
    contentType: renderAssetRef.contentType ?? null,
    renderKind: renderAssetRef.renderKind ?? "unknown",
    sceneReferences: auditEntry?.sceneReferences ?? [],
    presentationKeys: auditEntry?.presentationKeys ?? [],
    readinessByPresentationKey: auditEntry?.readinessByPresentationKey ?? [],
    derivativeNetworkStatus: null
  };
}

function normalizePortraitAuditEntry(
  value: ReaderAssetRef | ReaderPortraitRenderAuditEntry
): ReaderPortraitRenderAuditEntry {
  if ("assetRef" in value) {
    return value;
  }

  return {
    assetRef: value
  };
}

function incrementRenderModeCount(
  counts: Partial<Record<ReaderAssetRenderMode | "unknown", number>>,
  renderMode: ReaderAssetRenderMode | "unknown"
) {
  counts[renderMode] = (counts[renderMode] ?? 0) + 1;
}

function summarizePortraitDiagnostics(
  diagnostics: ReaderAssetRenderDiagnostics[]
): ReaderAssetRenderModeDumpSummary {
  const renderModeCounts: Partial<
    Record<ReaderAssetRenderMode | "unknown", number>
  > = {};

  diagnostics.forEach((diagnostic) => {
    incrementRenderModeCount(renderModeCounts, diagnostic.PORTRAIT_RENDER_MODE);
  });

  return {
    totalCharacterPortraitsFound: diagnostics.length,
    bitmapDerivativeCount: diagnostics.filter(
      (diagnostic) => diagnostic.PORTRAIT_RENDER_MODE === "bitmap-derivative"
    ).length,
    missingDerivativeMetadataCount: diagnostics.filter(
      (diagnostic) =>
        diagnostic.sourceSvgFallbackUsed ||
        !(
          diagnostic.iosDerivativeStoragePath &&
          diagnostic.iosDerivativeUrl &&
          diagnostic.iosDerivativeContentType &&
          isAlphaSafeBitmapContentType(diagnostic.iosDerivativeContentType) &&
          diagnostic.iosDerivativeHash &&
          typeof diagnostic.iosDerivativeWidth === "number" &&
          diagnostic.iosDerivativeWidth > 0 &&
          typeof diagnostic.iosDerivativeHeight === "number" &&
          diagnostic.iosDerivativeHeight > 0
        )
    ).length,
    derivativeUrlMissingOr404Count: diagnostics.filter(
      (diagnostic) =>
        diagnostic.derivativeNetworkStatus &&
        (!diagnostic.derivativeNetworkStatus.ok ||
          diagnostic.derivativeNetworkStatus.status === 404)
    ).length,
    svgFallbackCount: diagnostics.filter(
      (diagnostic) =>
        diagnostic.sourceSvgFallbackUsed ||
        diagnostic.PORTRAIT_RENDER_MODE === "source-svg-image" ||
        diagnostic.PORTRAIT_RENDER_MODE === "original-svg" ||
        diagnostic.PORTRAIT_RENDER_MODE === "true-vector-svg"
    ).length,
    notLocallyCachedCount: diagnostics.filter(
      (diagnostic) => !diagnostic.localCachedUri
    ).length,
    notImageRefWarmedCount: diagnostics.filter(
      (diagnostic) => !diagnostic.imageRefReady
    ).length,
    coldVisibleRenderCount: diagnostics.filter(
      (diagnostic) => diagnostic.COLD_RENDER_ON_VISIBLE_PATH
    ).length,
    imageRefReadyCount: diagnostics.filter(
      (diagnostic) => diagnostic.imageRefReady
    ).length,
    renderModeCounts
  };
}

export function dumpReaderAssetRenderModes(
  assetRefsOrEntries: Array<ReaderAssetRef | ReaderPortraitRenderAuditEntry>,
  runtime?: ReaderAssetRenderModeDump["runtime"]
) {
  const diagnostics = assetRefsOrEntries
    .map(normalizePortraitAuditEntry)
    .filter((entry) => entry.assetRef.role === "portrait")
    .map((entry) => {
      const record = getCachedRecord(entry.assetRef);
      const recordDiagnostics = record
        ? getDiagnosticsForRecord(record, entry)
        : null;

      return (
        recordDiagnostics ?? getUncachedAssetDiagnostics(entry.assetRef, entry)
      );
    });
  const dump: ReaderAssetRenderModeDump = {
    generatedAt: new Date().toISOString(),
    assets: diagnostics,
    summary: summarizePortraitDiagnostics(diagnostics),
    runtime
  };

  logAssetMetric("chapter character asset render modes", {
    assets: diagnostics,
    summary: dump.summary,
    runtime
  });

  if (dump.summary.svgFallbackCount > 0) {
    const message =
      "iOS character portraits are not all using bitmap derivatives";

    if (shouldUseStrictBitmapDerivatives()) {
      throw new Error(message);
    }

    logAssetWarning(message, dump.summary);
  }

  return dump;
}

async function fetchDerivativeNetworkStatus(
  derivativeUrl: string
): Promise<ReaderDerivativeNetworkStatus> {
  const startedAt = Date.now();

  try {
    let response = await fetch(derivativeUrl, {
      method: "HEAD"
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(derivativeUrl);
    }

    const contentLength = response.headers.get("content-length");

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: contentLength ? Number(contentLength) : null,
      cacheControl: response.headers.get("cache-control"),
      downloadDurationMs: Date.now() - startedAt,
      errorMessage: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentType: null,
      contentLength: null,
      cacheControl: null,
      downloadDurationMs: Date.now() - startedAt,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unable to verify derivative URL."
    };
  }
}

export async function verifyReaderPortraitDerivativeUrls(
  dump: ReaderAssetRenderModeDump
) {
  const statusesByUrl = new Map<string, ReaderDerivativeNetworkStatus>();
  const derivativeUrls = Array.from(
    new Set(
      dump.assets
        .map((asset) => asset.iosDerivativeUrl)
        .filter((url): url is string => Boolean(url))
    )
  );

  await Promise.all(
    derivativeUrls.map(async (url) => {
      statusesByUrl.set(url, await fetchDerivativeNetworkStatus(url));
    })
  );

  dump.assets.forEach((asset) => {
    asset.derivativeNetworkStatus = asset.iosDerivativeUrl
      ? (statusesByUrl.get(asset.iosDerivativeUrl) ?? null)
      : null;
  });
  dump.summary = summarizePortraitDiagnostics(dump.assets);

  logAssetMetric("chapter character derivative URL verification", {
    summary: dump.summary,
    derivativeUrls: Object.fromEntries(statusesByUrl)
  });

  if (dump.summary.derivativeUrlMissingOr404Count > 0) {
    logAssetWarning(
      "iOS character portrait derivative URLs failed verification",
      {
        count: dump.summary.derivativeUrlMissingOr404Count
      }
    );
  }

  return dump;
}

function getCachedRenderKind(input: {
  extension: string;
  metadata: ReaderCacheMetadata | null;
  renderMode: ReaderAssetRenderMode;
}): ReaderAssetRenderKind {
  if (input.metadata?.renderKind) {
    return input.metadata.renderKind;
  }

  if (input.extension === "svg") {
    return input.renderMode === "true-vector-svg"
      ? "svg-vector"
      : "svg-raster-wrapper";
  }

  return "bitmap";
}

function findExistingCachedAsset(
  assetRef: ReaderAssetRef,
  cacheKey: string,
  renderMode: ReaderAssetRenderMode
) {
  const knownRecord = cachedAssetsByKey.get(cacheKey) ?? null;

  if (
    knownRecord &&
    (isDataUri(knownRecord.localUri) ||
      isReadyFile(new File(knownRecord.localUri)))
  ) {
    cachedAssetsByUrl.set(assetRef.url, knownRecord);
    return knownRecord;
  }

  for (const extension of getCacheExtensionsForRenderMode(renderMode)) {
    const file = getCacheFile(cacheKey, extension);

    if (!isReadyFile(file)) {
      continue;
    }

    const metadata = readCacheMetadata(cacheKey);
    const resolvedRenderMode = metadata?.renderMode ?? renderMode;
    const renderKind = getCachedRenderKind({
      extension,
      metadata,
      renderMode: resolvedRenderMode
    });

    return createAssetRecord({
      assetRef,
      cacheKey,
      file,
      renderKind,
      renderMode: resolvedRenderMode,
      contentType: metadata?.contentType ?? null,
      detectedSourceType: metadata?.detectedSourceType ?? "unknown",
      fromCache: true,
      layoutMetrics: metadata?.layoutMetrics ?? null,
      alphaMode: metadata?.alphaMode ?? "unknown",
      sourceUrl:
        "originalUrl" in assetRef
          ? (assetRef.originalUrl as string)
          : undefined,
      warnings: extension.startsWith("embedded.")
        ? ["Using extracted embedded raster from cached SVG wrapper."]
        : []
    });
  }

  return null;
}

function findExistingCachedAssetForAnyRenderMode(assetRef: ReaderAssetRef) {
  for (const renderMode of getCacheRenderModeCandidates(assetRef)) {
    const cachedAsset = findExistingCachedAsset(
      assetRef,
      getResolvedCacheKey(assetRef, renderMode),
      renderMode
    );

    if (cachedAsset) {
      return cachedAsset;
    }
  }

  return null;
}

function logPortraitAssetDiagnostics(input: {
  assetRef: ReaderAssetRef;
  declaredContentType: string | null;
  detectedSourceType: ReaderAssetDetectedSourceType;
  extractedRasterByteIdentical?: boolean | null;
  record: ReaderCachedAsset;
  svgFallbackTriggered?: boolean;
}) {
  if (input.assetRef.role !== "portrait") {
    return;
  }

  logAssetMetric("portrait render diagnostics", {
    COLD_RENDER_ON_VISIBLE_PATH: isColdRenderOnVisiblePath(input.record),
    PORTRAIT_RENDER_MODE: input.record.renderMode,
    assetId: input.assetRef.assetId ?? null,
    cachedUri: input.record.localUri,
    cacheKey: input.record.cacheKey,
    cacheStatus: input.record.fromCache ? "hit" : "miss",
    declaredContentType: input.declaredContentType,
    decodeWarmDurationMs: input.record.decodeWarmDurationMs,
    derivativeAssetExists: input.record.derivativeAssetExists,
    derivativeAssetSelected: input.record.derivativeAssetSelected,
    downloadDurationMs: input.record.downloadDurationMs,
    detectedSourceType: input.detectedSourceType,
    extractedRasterByteIdentical: input.extractedRasterByteIdentical ?? null,
    fileSize: input.record.bytes,
    localCachedUri: input.record.localUri,
    originalSvgStoragePath: input.record.originalStoragePath,
    originalPath: input.assetRef.storagePath,
    originalUrl: input.assetRef.url,
    renderKind: input.record.renderKind,
    renderMode: input.record.renderMode,
    selectedDerivativeStoragePath: input.record.selectedDerivativeStoragePath,
    sourceContentType: input.record.contentType,
    sourceSvgFallbackUsed: input.record.sourceSvgFallbackUsed,
    svgFallbackTriggered: Boolean(input.svgFallbackTriggered)
  });
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

function isBlockingPortraitRecord(record: ReaderCachedAsset) {
  return (
    record.role === "portrait" && record.renderMode === "bitmap-derivative"
  );
}

function getRenderReadyForRecord(record: ReaderCachedAsset) {
  if (
    record.renderMode === "original-svg" ||
    record.renderMode === "true-vector-svg"
  ) {
    return Boolean(
      record.decodeWarmDurationMs != null && !record.failureReason
    );
  }

  if (isBlockingPortraitRecord(record)) {
    return record.fileReady && record.imageRefReady;
  }

  return record.fileReady;
}

async function predecodeBitmapAsset(
  record: ReaderCachedAsset,
  options?: {
    priority?: ReaderDecodePriority;
    requireImageRef?: boolean;
  }
) {
  if (
    record.renderMode === "original-svg" ||
    record.renderMode === "true-vector-svg"
  ) {
    return;
  }

  const startedAt = Date.now();
  record.fileReady = getFileExistsForUri(record.localUri);
  record.imagePrefetchResult = await runWithDecodeLimit(
    options?.priority ?? "medium",
    () =>
      ExpoImage.prefetch([record.localUri], {
        cachePolicy: "memory-disk"
      }).catch(() => false)
  );
  record.prefetchReady = record.imagePrefetchResult === true;
  const imageRef = await loadReaderImageRef(record.sourceUrl, {
    priority: options?.priority ?? "medium"
  });
  record.decodeWarmDurationMs = Date.now() - startedAt;
  record.nativeImageRefReady = Boolean(imageRef);
  record.imageRefReady = Boolean(imageRef);
  record.imageRefWidth =
    typeof imageRef?.width === "number" && imageRef.width > 0
      ? imageRef.width
      : null;
  record.imageRefHeight =
    typeof imageRef?.height === "number" && imageRef.height > 0
      ? imageRef.height
      : null;
  record.failureReason = imageRef ? null : "image-ref-load-failed-or-null";
  record.renderReady = getRenderReadyForRecord(record);

  if (options?.requireImageRef && !imageRef) {
    throw new Error(
      `Native ImageRef is required before rendering ${record.storagePath}.`
    );
  }
}

export async function prepareReaderCachedAssetRenderReady(
  record: ReaderCachedAsset,
  options?: {
    priority?: ReaderDecodePriority;
    requireImageRef?: boolean;
  }
) {
  const startedAt = Date.now();

  if (record.role === "portrait") {
    logAssetMetric("render strategy selected", {
      COLD_RENDER_ON_VISIBLE_PATH: isColdRenderOnVisiblePath(record),
      PORTRAIT_RENDER_MODE: record.renderMode,
      assetId: record.assetId,
      cacheKey: record.cacheKey,
      cachedUri: record.localUri,
      derivativeAssetExists: record.derivativeAssetExists,
      derivativeAssetSelected: record.derivativeAssetSelected,
      fileSize: record.bytes,
      originalSvgStoragePath: record.originalStoragePath,
      renderKind: record.renderKind,
      sourceSvgFallbackUsed: record.sourceSvgFallbackUsed,
      storagePath: record.storagePath
    });
  }

  if (
    record.renderMode === "original-svg" ||
    record.renderMode === "true-vector-svg"
  ) {
    const svgAst = await loadReaderSvgAst(record.sourceUrl);

    if (!svgAst) {
      throw new Error(
        `Unable to prepare SVG render tree for ${record.storagePath}.`
      );
    }

    record.decodeWarmDurationMs = Date.now() - startedAt;
    record.failureReason = null;
    record.renderReady = true;
    logAssetMetric("SVG prepared", {
      assetId: record.assetId ?? record.cacheKey,
      cachedUri: record.localUri,
      decodeWarmDurationMs: record.decodeWarmDurationMs,
      renderMode: record.renderMode,
      role: record.role,
      storagePath: record.storagePath
    });
    return;
  }

  await predecodeBitmapAsset(record, options);
  record.decodeWarmDurationMs =
    record.decodeWarmDurationMs ?? Date.now() - startedAt;
  record.renderReady = getRenderReadyForRecord(record);
  logAssetMetric("image render warmed", {
    assetId: record.assetId ?? record.cacheKey,
    cachedUri: record.localUri,
    decodeWarmDurationMs: record.decodeWarmDurationMs,
    fileReady: record.fileReady,
    failureReason: record.failureReason,
    imageRefHeight: record.imageRefHeight,
    imageRefReady: record.imageRefReady,
    imageRefWidth: record.imageRefWidth,
    prefetchReady: record.prefetchReady,
    renderReady: record.renderReady,
    renderMode: record.renderMode,
    role: record.role,
    storagePath: record.storagePath
  });
}

async function writeSvgAsset(input: {
  assetRef: ReaderAssetRef;
  contentType: string | null;
  detectedSourceType: ReaderAssetDetectedSourceType;
  svgXml: string;
}) {
  const resolvedInputAssetRef = input.assetRef as ResolvedReaderAssetRef;
  const sourceSvgFallbackUsed =
    input.assetRef.role === "portrait" &&
    !Boolean(resolvedInputAssetRef.derivativeAssetSelected);
  const fallbackReason =
    resolvedInputAssetRef.fallbackReason ??
    (sourceSvgFallbackUsed ? "downloaded-portrait-source-is-svg" : null);
  const assetRef: ResolvedReaderAssetRef = {
    ...input.assetRef,
    fallbackReason,
    originalSvgStoragePath:
      input.assetRef.originalSvgStoragePath ??
      resolvedInputAssetRef.originalStoragePath ??
      input.assetRef.storagePath,
    originalSvgUrl:
      input.assetRef.originalSvgUrl ??
      resolvedInputAssetRef.originalUrl ??
      input.assetRef.url,
    sourceRenderKind: "svg",
    sourceSvgFallbackUsed
  };

  if (sourceSvgFallbackUsed) {
    const details = {
      PORTRAIT_RENDER_MODE:
        getReaderPortraitDebugRenderModeOverride(input.assetRef) ??
        "source-svg-image",
      assetId: input.assetRef.assetId ?? null,
      fallbackReason,
      storagePath: input.assetRef.storagePath,
      url: input.assetRef.url
    };

    if (shouldUseStrictBitmapDerivatives()) {
      throw new Error(
        `Strict bitmap derivatives blocked portrait ${input.assetRef.storagePath}: ${fallbackReason}`
      );
    }

    logAssetWarning(
      "iOS character portrait downloaded SVG source because no bitmap derivative was selected",
      details
    );
  }

  const classification = classifySvgAssetPayload(input.svgXml);
  const forcedPortraitRenderMode =
    getReaderPortraitDebugRenderModeOverride(assetRef);
  const shouldExtractRaster =
    forcedPortraitRenderMode === "extracted-raster" &&
    Boolean(classification.embeddedRaster);

  if (shouldExtractRaster && classification.embeddedRaster) {
    const embeddedRasterBytes = decodeBase64Bytes(
      classification.embeddedRaster.base64
    );
    const rasterFileInfo = getRasterFileInfoFromBytes({
      bytes: embeddedRasterBytes,
      declaredMimeType: classification.embeddedRaster.mimeType
    });
    const embeddedRasterDimensions = getRasterDimensionsFromBytes({
      bytes: embeddedRasterBytes,
      mimeType: rasterFileInfo.mimeType
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
    const warnings = [...classification.warnings];

    if (rasterFileInfo.mimeType !== classification.embeddedRaster.mimeType) {
      warnings.push(
        `Embedded raster MIME ${classification.embeddedRaster.mimeType} did not match ${rasterFileInfo.mimeType} bytes.`
      );
    }

    if (rasterFileInfo.alphaMode === "opaque") {
      warnings.push(
        "Embedded raster format is opaque; transparent portrait background cannot be recovered from this source."
      );
    }

    const cacheKey = getResolvedCacheKey(assetRef, "extracted-raster");
    const file = getCacheFile(cacheKey, `embedded.${rasterFileInfo.extension}`);

    file.write(embeddedRasterBytes);

    if (!isReadyFile(file)) {
      throw new Error("Cached embedded raster file is empty.");
    }
    const extractedRasterByteIdentical = getWrittenFileByteIdentity(
      file,
      embeddedRasterBytes
    );

    const record = createAssetRecord({
      assetRef,
      cacheKey,
      file,
      renderKind: "bitmap",
      renderMode: "extracted-raster",
      contentType: rasterFileInfo.mimeType,
      detectedSourceType: input.detectedSourceType,
      fromCache: false,
      layoutMetrics,
      alphaMode: rasterFileInfo.alphaMode,
      warnings: extractedRasterByteIdentical
        ? warnings
        : [
            ...warnings,
            "Cached embedded raster bytes differ from the SVG data URL payload."
          ]
    });

    logPortraitAssetDiagnostics({
      assetRef,
      declaredContentType: input.contentType,
      detectedSourceType: input.detectedSourceType,
      extractedRasterByteIdentical,
      record
    });

    return record;
  }

  const renderMode: ReaderAssetRenderMode =
    forcedPortraitRenderMode === "original-svg"
      ? "original-svg"
      : forcedPortraitRenderMode === "source-svg-image"
        ? "source-svg-image"
        : assetRef.role === "portrait" ||
            classification.renderKind === "svg-raster-wrapper"
          ? "source-svg-image"
          : classification.renderKind === "svg-vector"
            ? "true-vector-svg"
            : "source-svg-image";
  const cacheKey = getResolvedCacheKey(assetRef, renderMode);
  const file = getCacheFile(cacheKey, "svg");
  file.write(input.svgXml);

  if (!isReadyFile(file)) {
    throw new Error("Cached SVG file is empty.");
  }

  const svgAst =
    renderMode === "original-svg" || renderMode === "true-vector-svg"
      ? parse(input.svgXml)
      : null;

  if (svgAst) {
    svgAstCache.set(assetRef.url, svgAst);
  }

  const record = createAssetRecord({
    assetRef,
    cacheKey,
    file,
    renderKind:
      classification.renderKind === "svg-vector"
        ? "svg-vector"
        : classification.renderKind === "svg-raster-wrapper"
          ? "svg-raster-wrapper"
          : "unknown",
    renderMode,
    contentType:
      extensionFromContentType(input.contentType) === "svg"
        ? input.contentType
        : "image/svg+xml",
    detectedSourceType: input.detectedSourceType,
    fromCache: false,
    layoutMetrics: classification.layoutMetrics,
    alphaMode: "alpha-safe",
    warnings:
      forcedPortraitRenderMode === "extracted-raster" &&
      !classification.embeddedRaster
        ? [
            ...classification.warnings,
            "Debug extracted-raster mode was requested, but the SVG contains no embedded raster."
          ]
        : classification.warnings
  });

  logPortraitAssetDiagnostics({
    assetRef,
    declaredContentType: input.contentType,
    detectedSourceType: input.detectedSourceType,
    extractedRasterByteIdentical: null,
    record,
    svgFallbackTriggered:
      Boolean(classification.embeddedRaster) &&
      forcedPortraitRenderMode !== "extracted-raster" &&
      renderMode === "original-svg"
  });

  return record;
}

async function downloadAndCacheAsset(
  assetRef: ReaderAssetRef,
  options?: {
    skipExistingCache?: boolean;
  }
) {
  ensureCacheDirectory();

  const renderAssetRef = resolveReaderAssetRefForVisibleRender(assetRef);
  const existingCachedAsset = options?.skipExistingCache
    ? null
    : findExistingCachedAssetForAnyRenderMode(renderAssetRef);

  if (existingCachedAsset) {
    logAssetMetric("cache hit", {
      COLD_RENDER_ON_VISIBLE_PATH:
        isColdRenderOnVisiblePath(existingCachedAsset),
      PORTRAIT_RENDER_MODE:
        existingCachedAsset.role === "portrait"
          ? existingCachedAsset.renderMode
          : undefined,
      assetId: existingCachedAsset.assetId,
      bytes: existingCachedAsset.bytes,
      derivativeAssetExists: existingCachedAsset.derivativeAssetExists,
      derivativeAssetSelected: existingCachedAsset.derivativeAssetSelected,
      localCachedUri: existingCachedAsset.localUri,
      role: renderAssetRef.role,
      sourceSvgFallbackUsed: existingCachedAsset.sourceSvgFallbackUsed,
      storagePath: renderAssetRef.storagePath
    });
    return existingCachedAsset;
  }

  const startedAt = Date.now();
  const response = await fetch(renderAssetRef.url);

  if (!response.ok) {
    throw new Error(`Asset download failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type");
  let record: ReaderCachedAsset;

  if (responseNeedsTextBody(renderAssetRef, contentType)) {
    record = await writeSvgAsset({
      assetRef: renderAssetRef,
      contentType,
      detectedSourceType: "svg",
      svgXml: await response.text()
    });
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytesLookLikeSvg(bytes)) {
      record = await writeSvgAsset({
        assetRef: renderAssetRef,
        contentType,
        detectedSourceType: "svg",
        svgXml: decodeUtf8Bytes(bytes)
      });
    } else {
      const rasterFileInfo = getRasterFileInfoFromBytes({
        bytes,
        declaredMimeType: contentType ?? "application/octet-stream"
      });
      const extension =
        rasterFileInfo.extension === "bin"
          ? inferBitmapExtension({
              assetRef: renderAssetRef,
              contentType,
              bytes
            })
          : rasterFileInfo.extension;
      const renderMode: ReaderAssetRenderMode =
        renderAssetRef.role === "portrait" &&
        Boolean(renderAssetRef.derivativeAssetSelected)
          ? "bitmap-derivative"
          : "bitmap";
      const cacheKey = getResolvedCacheKey(renderAssetRef, renderMode);
      const file = getCacheFile(cacheKey, extension);

      file.write(bytes);

      if (!isReadyFile(file)) {
        throw new Error("Cached bitmap file is empty.");
      }

      record = createAssetRecord({
        assetRef: renderAssetRef,
        cacheKey,
        file,
        renderKind: "bitmap",
        renderMode,
        contentType: rasterFileInfo.mimeType,
        detectedSourceType: getDetectedSourceTypeFromExtension(
          extensionFromBytes(bytes) ?? extension
        ),
        fromCache: false,
        alphaMode: rasterFileInfo.alphaMode,
        sourceUrl:
          "originalUrl" in renderAssetRef
            ? renderAssetRef.originalUrl
            : undefined
      });

      logPortraitAssetDiagnostics({
        assetRef: renderAssetRef,
        declaredContentType: contentType,
        detectedSourceType: record.detectedSourceType,
        record
      });
    }
  }

  record.downloadDurationMs = Date.now() - startedAt;
  logAssetMetric("downloaded", {
    bytes: record.bytes,
    decodeWarmDurationMs: record.decodeWarmDurationMs,
    derivativeAssetExists: record.derivativeAssetExists,
    derivativeAssetSelected: record.derivativeAssetSelected,
    downloadDurationMs: record.downloadDurationMs,
    durationMs: Date.now() - startedAt,
    renderKind: record.renderKind,
    renderMode: record.renderMode,
    role: record.role,
    sourceSvgFallbackUsed: record.sourceSvgFallbackUsed,
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

export async function ensureReaderAssetReady(
  assetRef: ReaderAssetRef,
  options?: ReaderAssetReadyOptions
) {
  const renderAssetRef = resolveReaderAssetRefForVisibleRender(assetRef);

  if (isDataUri(renderAssetRef.url)) {
    return createInlineAssetRecord({
      assetRef: renderAssetRef,
      cacheKey: getResolvedCacheKey(renderAssetRef, "bitmap-derivative"),
      renderKind: "bitmap",
      renderMode: "bitmap-derivative",
      contentType: renderAssetRef.contentType ?? "image/webp",
      detectedSourceType: "webp",
      sourceUrl: renderAssetRef.originalUrl ?? renderAssetRef.url
    });
  }

  if (!isRemoteImageUrl(renderAssetRef.url)) {
    const file = new File(renderAssetRef.url);
    const renderMode = getPreferredCacheRenderMode(renderAssetRef);

    if (isLocalUri(renderAssetRef.url) && !isReadyFile(file)) {
      throw new Error(`Local asset is missing or empty: ${renderAssetRef.url}`);
    }

    return createAssetRecord({
      assetRef: renderAssetRef,
      cacheKey: getResolvedCacheKey(renderAssetRef, renderMode),
      file,
      renderKind:
        renderAssetRef.renderKind ??
        (renderMode === "bitmap" ? "bitmap" : "svg-raster-wrapper"),
      renderMode,
      contentType: renderAssetRef.contentType ?? null,
      detectedSourceType: getDetectedSourceTypeFromExtension(
        extensionFromContentType(renderAssetRef.contentType) ??
          getPathExtension(renderAssetRef.url)
      ),
      fromCache: true,
      sourceUrl:
        "originalUrl" in renderAssetRef ? renderAssetRef.originalUrl : undefined
    });
  }

  const cachedRecord = options?.forceRefresh
    ? null
    : findExistingCachedAssetForAnyRenderMode(renderAssetRef);

  if (cachedRecord) {
    return cachedRecord;
  }

  const downloadKey = `${getResolvedBaseCacheKey(
    renderAssetRef
  )}-download-v${READER_ASSET_RENDER_CACHE_VERSION}${
    options?.forceRefresh ? "-refresh" : ""
  }`;
  const existingLoad = inFlightAssetLoads.get(downloadKey);

  if (existingLoad) {
    return existingLoad;
  }

  const load = runWithDownloadLimit(() =>
    downloadAndCacheAsset(assetRef, {
      skipExistingCache: options?.forceRefresh
    })
  ).finally(() => {
    inFlightAssetLoads.delete(downloadKey);
  });

  inFlightAssetLoads.set(downloadKey, load);
  return load;
}

function getDecodePriorityForScope(input: {
  override?: ReaderDecodePriority;
  scope: ReaderAssetCacheResult["scope"];
}) {
  return (
    input.override ??
    (input.scope === "chapter"
      ? "low"
      : input.scope === "warm"
        ? "medium"
        : "high")
  );
}

function canRefreshCachedBitmapDerivative(record: ReaderCachedAsset) {
  const refreshUrl = record.selectedDerivativeUrl ?? record.sourceUrl;

  return (
    record.fromCache &&
    isBlockingPortraitRecord(record) &&
    !isDataUri(record.localUri) &&
    isRemoteImageUrl(refreshUrl)
  );
}

async function prepareReaderCachedAssetRenderReadyWithCacheRefresh(input: {
  asset: ReaderCachedAsset;
  assetRef: ReaderAssetRef;
  priority: ReaderDecodePriority;
  requireImageRef: boolean;
  scope: ReaderAssetCacheResult["scope"];
}) {
  try {
    await prepareReaderCachedAssetRenderReady(input.asset, {
      priority: input.priority,
      requireImageRef: input.requireImageRef
    });
    return input.asset;
  } catch (error) {
    if (
      input.scope !== "scene" ||
      !input.requireImageRef ||
      !canRefreshCachedBitmapDerivative(input.asset)
    ) {
      throw error;
    }

    clearNativeImageRefCacheForRecord(input.asset);
    logAssetWarning(
      "cached bitmap derivative failed native decode; refreshing local cache",
      {
        assetId: input.asset.assetId,
        cacheKey: input.asset.cacheKey,
        cachedUri: input.asset.localUri,
        failureReason: input.asset.failureReason,
        storagePath: input.asset.storagePath
      }
    );

    const refreshedAsset = await ensureReaderAssetReady(input.assetRef, {
      forceRefresh: true
    });

    await prepareReaderCachedAssetRenderReady(refreshedAsset, {
      priority: input.priority,
      requireImageRef: input.requireImageRef
    });

    return refreshedAsset;
  }
}

async function ensureAssetRefsReady(input: {
  scope: ReaderAssetCacheResult["scope"];
  scopeId: string;
  assetRefs: ReaderAssetRef[];
  priority?: ReaderDecodePriority;
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
  const assetRefsForAssets: ReaderAssetRef[] = [];
  const errors: ReaderAssetCacheError[] = [];

  settledResults.forEach((result, index) => {
    const assetRef = uniqueAssetRefs[index];

    if (!assetRef) {
      return;
    }

    if (result.status === "fulfilled") {
      assets.push(result.value);
      assetRefsForAssets.push(assetRef);
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
    logAssetMetric(`${input.scope} files ready`, {
      assetCount: assets.length,
      durationMs: Date.now() - startedAt,
      scopeId: input.scopeId
    });

    const priority = getDecodePriorityForScope({
      override: input.priority,
      scope: input.scope
    });
    const renderReadyResults = await Promise.allSettled(
      assets.map((asset, index) => {
        const assetRef = assetRefsForAssets[index];
        const requireImageRef =
          input.scope === "scene" && isBlockingPortraitRecord(asset);

        return prepareReaderCachedAssetRenderReadyWithCacheRefresh({
          asset,
          assetRef: assetRef ?? {
            role: asset.role,
            url: asset.sourceUrl,
            storagePath: asset.storagePath,
            cacheKey: asset.cacheKey
          },
          priority,
          requireImageRef,
          scope: input.scope
        }).then((preparedAsset) => {
          assets[index] = preparedAsset;
        });
      })
    );

    renderReadyResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        return;
      }

      const asset = assets[index];

      if (!asset) {
        return;
      }

      errors.push({
        assetRef: {
          role: asset.role,
          url: asset.sourceUrl,
          storagePath: asset.storagePath,
          cacheKey: asset.cacheKey
        },
        message:
          result.reason instanceof Error
            ? result.reason.message
            : "Unable to prepare reader asset render tree."
      });
    });

    cacheResult.status = errors.length > 0 ? "error" : "success";
    cacheResult.durationMs = Date.now() - startedAt;
  }

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
  assetRefs: ReaderAssetRef[],
  priority: ReaderDecodePriority = "high"
) {
  return ensureAssetRefsReady({
    scope: "scene",
    scopeId: sceneId,
    assetRefs,
    priority
  });
}

export function ensureChapterAssetsReady(
  chapterId: string,
  assetRefs: ReaderAssetRef[]
) {
  return ensureAssetRefsReady({
    scope: "chapter",
    scopeId: chapterId,
    assetRefs,
    priority: "low"
  });
}

export function warmNextSceneAssets(
  sceneId: string,
  assetRefs: ReaderAssetRef[],
  priority: ReaderDecodePriority = "low"
) {
  return ensureAssetRefsReady({
    scope: "warm",
    scopeId: sceneId,
    assetRefs,
    priority
  });
}

export async function clearReaderAssetCache(): Promise<ReaderAssetCacheClearResult> {
  nativeImageRefCache.clear();
  inFlightNativeImageLoads.clear();
  svgAstCache.clear();
  inFlightSvgAstLoads.clear();
  cachedAssetsByUrl.clear();
  cachedAssetsByKey.clear();
  inFlightAssetLoads.clear();
  queuedDownloads.splice(0, queuedDownloads.length);
  activeDownloadCount = 0;
  queuedDecodeTasks.splice(0, queuedDecodeTasks.length);
  activeDecodeCount = 0;

  deleteCacheDirectoryIfPresent();
  ensureCacheDirectory();

  const [expoMemoryCacheCleared, expoDiskCacheCleared] = await Promise.all([
    ExpoImage.clearMemoryCache().catch(() => false),
    ExpoImage.clearDiskCache().catch(() => false)
  ]);

  const result: ReaderAssetCacheClearResult = {
    status: "cleared",
    readerAssetCacheDirectory: getCacheDirectory().uri,
    expoDiskCacheCleared,
    expoMemoryCacheCleared
  };

  logAssetMetric("reader asset cache cleared", result);

  return result;
}

globalThis.__OCNOER_READER_CLEAR_ASSET_CACHE = clearReaderAssetCache;

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

export function getAssetRenderMode(
  assetRefOrUrl: ReaderAssetRef | string
): ReaderAssetRenderMode | "unknown" {
  return getCachedRecord(assetRefOrUrl)?.renderMode ?? "unknown";
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
      COLD_RENDER_ON_VISIBLE_PATH: true,
      diagnostics: getReaderAssetRenderDiagnostics(imageUrl),
      imageUrl
    });
    return null;
  }

  return createReaderImageSource(cachedUri ?? imageUrl);
}

export function getPreloadedReaderImageRef(imageUrl: string) {
  return nativeImageRefCache.get(imageUrl) ?? null;
}

export function loadReaderImageRef(
  imageUrl: string,
  options?: {
    priority?: ReaderDecodePriority;
  }
) {
  const renderMode = getAssetRenderMode(imageUrl);

  if (renderMode === "original-svg" || renderMode === "true-vector-svg") {
    return Promise.resolve(null);
  }

  const cachedUri = getCachedAssetUri(imageUrl);
  const renderUri = cachedUri ?? (isRemoteImageUrl(imageUrl) ? null : imageUrl);

  if (!renderUri) {
    return Promise.resolve(null);
  }

  const cachedImageRef = getPreloadedReaderImageRef(imageUrl);

  if (cachedImageRef) {
    const record = cachedAssetsByUrl.get(imageUrl) ?? null;

    if (record) {
      record.nativeImageRefReady = true;
      record.imageRefReady = true;
      record.imageRefWidth =
        typeof cachedImageRef.width === "number" && cachedImageRef.width > 0
          ? cachedImageRef.width
          : record.imageRefWidth;
      record.imageRefHeight =
        typeof cachedImageRef.height === "number" && cachedImageRef.height > 0
          ? cachedImageRef.height
          : record.imageRefHeight;
      record.failureReason = null;
      record.renderReady = getRenderReadyForRecord(record);
    }

    return Promise.resolve(cachedImageRef);
  }

  const existingLoad = inFlightNativeImageLoads.get(imageUrl);

  if (existingLoad) {
    return existingLoad;
  }

  const load = runWithDecodeLimit(options?.priority ?? "medium", () =>
    ExpoImage.loadAsync({
      uri: renderUri,
      cacheKey: imageUrl
    })
  )
    .then((imageRef) => {
      const record = cachedAssetsByUrl.get(imageUrl) ?? null;

      if (!imageRef) {
        if (record) {
          record.nativeImageRefReady = false;
          record.imageRefReady = false;
          record.failureReason = "image-ref-load-returned-null";
          record.renderReady = getRenderReadyForRecord(record);
        }
        return null;
      }

      if (record) {
        const naturalWidth =
          typeof imageRef.width === "number" && imageRef.width > 0
            ? imageRef.width
            : record.layoutMetrics?.naturalWidth;
        const naturalHeight =
          typeof imageRef.height === "number" && imageRef.height > 0
            ? imageRef.height
            : record.layoutMetrics?.naturalHeight;

        record.layoutMetrics = {
          ...record.layoutMetrics,
          naturalWidth,
          naturalHeight
        };
        cachedAssetsByKey.set(record.cacheKey, record);
      }

      nativeImageRefCache.set(imageUrl, imageRef);
      if (record) {
        record.nativeImageRefReady = true;
        record.imageRefReady = true;
        record.imageRefWidth =
          typeof imageRef.width === "number" && imageRef.width > 0
            ? imageRef.width
            : null;
        record.imageRefHeight =
          typeof imageRef.height === "number" && imageRef.height > 0
            ? imageRef.height
            : null;
        record.failureReason = null;
        record.renderReady = getRenderReadyForRecord(record);
      }
      return imageRef;
    })
    .catch((error) => {
      const record = cachedAssetsByUrl.get(imageUrl) ?? null;

      if (record) {
        record.nativeImageRefReady = false;
        record.imageRefReady = false;
        record.failureReason =
          error instanceof Error ? error.message : "image-ref-load-failed";
        record.renderReady = getRenderReadyForRecord(record);
      }

      return null;
    })
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
  const renderMode = getAssetRenderMode(imageUrl);

  if (renderMode !== "original-svg" && renderMode !== "true-vector-svg") {
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
