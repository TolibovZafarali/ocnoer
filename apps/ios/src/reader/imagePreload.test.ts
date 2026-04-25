import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = new Map<string, string | Uint8Array>();
const mockLoadAsync = vi.fn(async () => ({ id: "image-ref" }));
const mockPrefetch = vi.fn(async () => true);

function joinUri(parts: Array<string | { uri: string }>) {
  return parts
    .map((part) => (typeof part === "string" ? part : part.uri))
    .join("/")
    .replace(/([^:]\/)\/+/g, "$1");
}

class MockDirectory {
  uri: string;

  constructor(...uris: Array<string | { uri: string }>) {
    this.uri = joinUri(uris);
  }

  create() {
    return undefined;
  }
}

class MockFile {
  uri: string;

  constructor(...uris: Array<string | { uri: string }>) {
    this.uri = joinUri(uris);
  }

  info() {
    const value = mockFiles.get(this.uri);

    return {
      exists: Boolean(value),
      size:
        typeof value === "string"
          ? value.length
          : value instanceof Uint8Array
            ? value.length
            : 0
    };
  }

  get size() {
    return this.info().size;
  }

  write(value: string | Uint8Array) {
    mockFiles.set(this.uri, value);
  }

  async text() {
    const value = mockFiles.get(this.uri);

    return typeof value === "string" ? value : "";
  }

  bytesSync() {
    const value = mockFiles.get(this.uri);

    if (value instanceof Uint8Array) {
      return value;
    }

    return typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array();
  }

  textSync() {
    const value = mockFiles.get(this.uri);

    return typeof value === "string" ? value : "";
  }
}

vi.mock("expo-file-system", () => ({
  Directory: MockDirectory,
  File: MockFile,
  Paths: {
    cache: new MockDirectory("file:///cache")
  }
}));

vi.mock("expo-image", () => ({
  Image: {
    loadAsync: mockLoadAsync,
    prefetch: mockPrefetch
  }
}));

vi.mock("react-native-svg", () => ({
  parse: () => ({
    type: "svg"
  })
}));

function createPngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
}

const transparentPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAoAAAAUACAY=";

function createResponse(input: {
  contentType: string;
  body: string | Uint8Array;
  ok?: boolean;
  status?: number;
}) {
  return {
    ok: input.ok ?? true,
    status: input.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? input.contentType : null
    },
    arrayBuffer: async () =>
      input.body instanceof Uint8Array
        ? input.body.buffer
        : new TextEncoder().encode(input.body).buffer,
    text: async () =>
      typeof input.body === "string"
        ? input.body
        : Array.from(input.body).join("")
  };
}

describe("reader asset cache", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLoadAsync.mockClear();
    mockPrefetch.mockClear();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete globalThis.__OCNOER_READER_PORTRAIT_RENDER_MODE_OVERRIDES;
  });

  it("dedupes extensionless remote bitmap downloads and stores a local uri", async () => {
    const fetchMock = vi.fn(async () =>
      createResponse({
        contentType: "image/png",
        body: createPngBytes()
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { ensureSceneAssetsReady, getCachedAssetUri, getAssetRenderKind } =
      await import("./imagePreload");
    const assetRef = {
      role: "background" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/bg_1",
      storagePath: "runtime/bg_1",
      cacheKey: "background:bg_1"
    };

    const [firstResult, secondResult] = await Promise.all([
      ensureSceneAssetsReady("scene_one", [assetRef]),
      ensureSceneAssetsReady("scene_one", [assetRef])
    ]);

    expect(firstResult.status).toBe("success");
    expect(secondResult.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedAssetUri(assetRef)?.endsWith(".png")).toBe(true);
    expect(getAssetRenderKind(assetRef)).toBe("bitmap");
  });

  it("classifies true vector SVG separately from embedded-raster SVG wrappers", async () => {
    const { classifySvgAssetPayload } = await import("./imagePreload");

    expect(
      classifySvgAssetPayload('<svg><path d="M0 0" /></svg>')
    ).toMatchObject({
      renderKind: "svg-vector",
      embeddedRaster: null
    });
    expect(
      classifySvgAssetPayload(
        '<svg><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" /></svg>'
      )
    ).toMatchObject({
      renderKind: "svg-raster-wrapper",
      embeddedRaster: {
        extension: "png"
      }
    });
  });

  it("renders source SVG wrappers through the original cached SVG by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "application/octet-stream",
          body: `<svg width="900" height="1400" viewBox="0 0 900 1400"><image x="120" y="80" width="640" height="1280" href="data:image/png;base64,${transparentPngBase64}" /></svg>`
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetLayoutMetrics,
      getCachedAssetUri,
      getAssetRenderKind,
      getAssetRenderMode
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/character_svg_wrapper",
      storagePath: "runtime/character_svg_wrapper",
      cacheKey: "portrait:character_svg_wrapper"
    };

    const result = await ensureSceneAssetsReady("scene_svg_wrapper", [
      assetRef
    ]);

    expect(result.status).toBe("success");
    expect(result.assets[0]).toMatchObject({
      renderKind: "svg-raster-wrapper",
      renderMode: "original-svg",
      alphaMode: "alpha-safe",
      contentType: "image/svg+xml"
    });
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
    expect(getAssetRenderKind(assetRef)).toBe("svg-raster-wrapper");
    expect(getAssetRenderMode(assetRef)).toBe("original-svg");
    expect(getAssetLayoutMetrics(assetRef)).toMatchObject({
      svgWrapper: {
        width: 900,
        height: 1400,
        embeddedImage: {
          x: 120,
          y: 80,
          width: 640,
          height: 1280
        }
      }
    });
    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it("keeps mislabeled source SVG wrappers as SVG instead of extracting to jpeg", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "application/octet-stream",
          body: `<svg width="900" height="1400"><image width="640" height="1280" href="data:image/jpeg;base64,${transparentPngBase64}" /></svg>`
        })
      )
    );
    const { ensureSceneAssetsReady, getAssetRenderMode, getCachedAssetUri } =
      await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/mislabeled_character",
      storagePath: "runtime/mislabeled_character",
      cacheKey: "portrait:mislabeled_character"
    };

    const result = await ensureSceneAssetsReady("scene_mislabeled", [assetRef]);

    expect(result.status).toBe("success");
    expect(result.assets[0]).toMatchObject({
      renderMode: "original-svg",
      alphaMode: "alpha-safe",
      contentType: "image/svg+xml"
    });
    expect(getAssetRenderMode(assetRef)).toBe("original-svg");
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
    expect(getCachedAssetUri(assetRef)?.endsWith(".embedded.jpg")).toBe(false);
  });

  it("classifies true vector SVG source assets with their own render mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/svg+xml",
          body: '<svg width="100" height="200"><path d="M0 0h100v200H0z" fill="none" /></svg>'
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetRenderKind,
      getAssetRenderMode,
      getCachedAssetUri
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/vector_character.svg",
      storagePath: "runtime/vector_character.svg",
      cacheKey: "portrait:vector_character"
    };

    const result = await ensureSceneAssetsReady("scene_vector", [assetRef]);

    expect(result.status).toBe("success");
    expect(result.assets[0]).toMatchObject({
      renderKind: "svg-vector",
      renderMode: "true-vector-svg"
    });
    expect(getAssetRenderKind(assetRef)).toBe("svg-vector");
    expect(getAssetRenderMode(assetRef)).toBe("true-vector-svg");
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
  });

  it("uses original SVG fallback when extraction transparency cannot be proven", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/svg+xml",
          body: '<svg width="900" height="1400"><image width="900" height="1400" href="data:image/jpeg;base64,/9j/4AAQSkZJRg==" /></svg>'
        })
      )
    );
    const { ensureSceneAssetsReady, getAssetRenderMode, getCachedAssetUri } =
      await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/opaque_embedded.svg",
      storagePath: "runtime/opaque_embedded.svg",
      cacheKey: "portrait:opaque_embedded"
    };

    const result = await ensureSceneAssetsReady("scene_opaque_embedded", [
      assetRef
    ]);

    expect(result.status).toBe("success");
    expect(result.assets[0]).toMatchObject({
      renderKind: "svg-raster-wrapper",
      renderMode: "original-svg",
      alphaMode: "alpha-safe"
    });
    expect(getAssetRenderMode(assetRef)).toBe("original-svg");
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
  });

  it("can force extracted bitmap mode in development and preserves bytes exactly", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "application/octet-stream",
          body: `<svg width="900" height="1400"><image width="640" height="1280" href="data:image/png;base64,${transparentPngBase64}" /></svg>`
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetRenderMode,
      getCachedAssetUri,
      setReaderPortraitDebugRenderModeOverrides
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/force_extracted.svg",
      storagePath: "runtime/force_extracted.svg",
      cacheKey: "portrait:force_extracted"
    };

    setReaderPortraitDebugRenderModeOverrides([
      {
        storagePathIncludes: "force_extracted",
        mode: "extracted-raster"
      }
    ]);

    const result = await ensureSceneAssetsReady("scene_force_extracted", [
      assetRef
    ]);
    const cachedUri = getCachedAssetUri(assetRef);
    const cachedBytes = cachedUri ? mockFiles.get(cachedUri) : null;
    const expectedBytes = new Uint8Array(
      Buffer.from(transparentPngBase64, "base64")
    );

    expect(result.status).toBe("success");
    expect(result.assets[0]).toMatchObject({
      renderMode: "extracted-raster",
      contentType: "image/png",
      alphaMode: "alpha-safe"
    });
    expect(getAssetRenderMode(assetRef)).toBe("extracted-raster");
    expect(cachedUri?.endsWith(".embedded.png")).toBe(true);
    expect(cachedBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(cachedBytes as Uint8Array)).toEqual(
      Array.from(expectedBytes)
    );
  });

  it("includes render mode and version in cache keys", async () => {
    const { getReaderAssetCacheKeyForRenderMode } =
      await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/keyed.svg",
      storagePath: "runtime/keyed.svg",
      cacheKey: "portrait:keyed"
    };

    expect(
      getReaderAssetCacheKeyForRenderMode(assetRef, "original-svg")
    ).toContain("source-svg-v2");
    expect(
      getReaderAssetCacheKeyForRenderMode(assetRef, "extracted-raster")
    ).toContain("extracted-raster-v2");
    expect(getReaderAssetCacheKeyForRenderMode(assetRef, "bitmap")).toContain(
      "bitmap-v2"
    );
    expect(
      getReaderAssetCacheKeyForRenderMode(assetRef, "true-vector-svg")
    ).toContain("true-vector-svg-v2");
    expect(
      new Set([
        getReaderAssetCacheKeyForRenderMode(assetRef, "original-svg"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "extracted-raster"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "bitmap"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "true-vector-svg")
      ]).size
    ).toBe(4);
  });

  it("does not reuse stale extracted files for source SVG render mode", async () => {
    const {
      ensureSceneAssetsReady,
      getCachedAssetUri,
      getReaderAssetCacheKeyForRenderMode
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/stale.svg",
      storagePath: "runtime/stale.svg",
      cacheKey: "portrait:stale"
    };
    const sourceSvgCacheKey = getReaderAssetCacheKeyForRenderMode(
      assetRef,
      "original-svg"
    );
    mockFiles.set(
      `file:///cache/ocnoer-reader-assets-v2/${sourceSvgCacheKey}.embedded.png`,
      createPngBytes()
    );
    const fetchMock = vi.fn(async () =>
      createResponse({
        contentType: "image/svg+xml",
        body: '<svg width="100" height="200"><image width="100" height="200" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" /></svg>'
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureSceneAssetsReady("scene_stale", [assetRef]);

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
  });

  it("reports asset failures instead of marking a scene ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/png",
          body: createPngBytes(),
          ok: false,
          status: 404
        })
      )
    );
    const { ensureSceneAssetsReady, getAssetCacheErrorMessage } =
      await import("./imagePreload");
    const result = await ensureSceneAssetsReady("scene_missing", [
      {
        role: "portrait",
        url: "https://example.supabase.co/storage/v1/object/public/runtime/missing",
        storagePath: "runtime/missing",
        cacheKey: "portrait:missing"
      }
    ]);

    expect(result.status).toBe("error");
    expect(getAssetCacheErrorMessage(result)).toContain("runtime/missing");
  });
});
