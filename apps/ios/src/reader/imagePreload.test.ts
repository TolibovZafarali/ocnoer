import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = new Map<string, string | Uint8Array>();
const mockLoadAsync = vi.fn(async () => ({ id: "image-ref" }));
const mockPrefetch = vi.fn(async () => true);
const mockParse = vi.fn(() => ({
  type: "svg"
}));

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
  parse: mockParse
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
    mockParse.mockClear();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete globalThis.__OCNOER_READER_PORTRAIT_RENDER_MODE_OVERRIDES;
    delete globalThis.__OCNOER_READER_FORCE_ALL_CHARACTER_PORTRAITS_TO_LOCAL_TEST_BITMAP;
    delete globalThis.__OCNOER_READER_STRICT_BITMAP_DERIVATIVES;
    delete globalThis.__OCNOER_READER_CLEAR_ASSET_CACHE;
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

  it("renders source SVG wrappers through expo-image by default", async () => {
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
      renderMode: "source-svg-image",
      alphaMode: "alpha-safe",
      contentType: "image/svg+xml"
    });
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
    expect(getAssetRenderKind(assetRef)).toBe("svg-raster-wrapper");
    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
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
    expect(mockPrefetch).toHaveBeenCalled();
    expect(mockParse).not.toHaveBeenCalled();
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
      renderMode: "source-svg-image",
      alphaMode: "alpha-safe",
      contentType: "image/svg+xml"
    });
    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
    expect(getCachedAssetUri(assetRef)?.endsWith(".embedded.jpg")).toBe(false);
  });

  it("renders true vector portrait SVG source assets through expo-image", async () => {
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
      renderMode: "source-svg-image"
    });
    expect(getAssetRenderKind(assetRef)).toBe("svg-vector");
    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
    expect(getCachedAssetUri(assetRef)?.endsWith(".svg")).toBe(true);
  });

  it("keeps opaque embedded SVG wrappers on the source SVG image path", async () => {
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
      renderMode: "source-svg-image",
      alphaMode: "alpha-safe"
    });
    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
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
      getReaderAssetCacheKeyForRenderMode(assetRef, "source-svg-image")
    ).toContain("source-svg-image-v2");
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
      getReaderAssetCacheKeyForRenderMode(assetRef, "bitmap-derivative")
    ).toContain("bitmap-derivative-v2");
    expect(
      getReaderAssetCacheKeyForRenderMode(assetRef, "true-vector-svg")
    ).toContain("true-vector-svg-v2");
    expect(
      new Set([
        getReaderAssetCacheKeyForRenderMode(assetRef, "original-svg"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "source-svg-image"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "extracted-raster"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "bitmap"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "bitmap-derivative"),
        getReaderAssetCacheKeyForRenderMode(assetRef, "true-vector-svg")
      ]).size
    ).toBe(6);
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
      "source-svg-image"
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

  it("prefers transparent bitmap derivatives when runtime metadata provides them", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      createResponse({
        contentType: "image/png",
        body: createPngBytes()
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const {
      dumpReaderAssetRenderModes,
      ensureSceneAssetsReady,
      getAssetRenderMode,
      getCachedAssetUri,
      getReaderAssetRenderDiagnostics
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/portrait.svg",
      storagePath: "runtime/portrait.svg",
      cacheKey: "portrait:derivative",
      derivatives: [
        {
          storagePath: "runtime/portrait.reader.png",
          url: "https://example.supabase.co/storage/v1/object/public/runtime/portrait.reader.png",
          cacheKey: "portrait:derivative:png",
          contentType: "image/png",
          renderKind: "bitmap" as const,
          width: 900,
          height: 1400,
          hash: "abc123",
          derivativeOf: "runtime/portrait.svg"
        }
      ]
    };

    const result = await ensureSceneAssetsReady("scene_derivative", [assetRef]);

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/public/runtime/portrait.reader.png"
    );
    expect(result.assets[0]).toMatchObject({
      renderMode: "bitmap-derivative",
      renderKind: "bitmap",
      contentType: "image/png"
    });
    expect(getAssetRenderMode(assetRef)).toBe("bitmap-derivative");
    expect(getAssetRenderMode(assetRef)).not.toBe("source-svg-image");
    expect(getCachedAssetUri(assetRef)?.endsWith(".png")).toBe(true);
    expect(getReaderAssetRenderDiagnostics(assetRef)).toMatchObject({
      PORTRAIT_RENDER_MODE: "bitmap-derivative",
      derivativeAssetExists: true,
      derivativeAssetSelected: true,
      sourceSvgFallbackUsed: false,
      storagePath: "runtime/portrait.reader.png"
    });
    expect(dumpReaderAssetRenderModes([assetRef])).toMatchObject({
      assets: [
        expect.objectContaining({
          PORTRAIT_RENDER_MODE: "bitmap-derivative",
          derivativeAssetSelected: true,
          localCachedUri: expect.stringContaining(".png")
        })
      ],
      summary: expect.objectContaining({
        bitmapDerivativeCount: 1,
        svgFallbackCount: 0
      })
    });
  });

  it("logs a loud development warning when a portrait SVG has no derivative", async () => {
    vi.stubGlobal("__DEV__", true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/svg+xml",
          body: '<svg width="100" height="200"><path d="M0 0h100v200H0z" /></svg>'
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetRenderMode,
      getReaderAssetRenderDiagnostics
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/no-derivative.svg",
      storagePath: "runtime/no-derivative.svg",
      cacheKey: "portrait:no-derivative",
      sourceRenderKind: "svg" as const
    };

    const result = await ensureSceneAssetsReady("scene_no_derivative", [
      assetRef
    ]);

    expect(result.status).toBe("success");
    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
    expect(getReaderAssetRenderDiagnostics(assetRef)).toMatchObject({
      PORTRAIT_RENDER_MODE: "source-svg-image",
      derivativeAssetExists: false,
      derivativeAssetSelected: false,
      sourceSvgFallbackUsed: true
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "iOS character portrait is falling back to source SVG"
      ),
      expect.objectContaining({
        storagePath: "runtime/no-derivative.svg"
      })
    );
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
  it("can force original react-native-svg mode in development", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/svg+xml",
          body: '<svg width="100" height="200"><path d="M0 0h100v200H0z" /></svg>'
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetRenderMode,
      setReaderPortraitDebugRenderModeOverrides
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/force_original.svg",
      storagePath: "runtime/force_original.svg",
      cacheKey: "portrait:force_original"
    };

    setReaderPortraitDebugRenderModeOverrides([
      {
        storagePathIncludes: "force_original",
        mode: "original-svg"
      }
    ]);

    const result = await ensureSceneAssetsReady("scene_force_original", [
      assetRef
    ]);

    expect(result.status).toBe("success");
    expect(getAssetRenderMode(assetRef)).toBe("original-svg");
    expect(mockParse).toHaveBeenCalled();
  });

  it("allows source SVG only when a development override explicitly forces it", async () => {
    vi.stubGlobal("__DEV__", true);
    const fetchMock = vi.fn(async (url: string) =>
      createResponse({
        contentType: url.endsWith(".webp") ? "image/webp" : "image/svg+xml",
        body: url.endsWith(".webp")
          ? createPngBytes()
          : '<svg width="100" height="200"><path d="M0 0h100v200H0z" /></svg>'
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const {
      ensureSceneAssetsReady,
      getAssetRenderMode,
      setReaderPortraitDebugRenderModeOverrides
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/force-source.svg",
      storagePath: "runtime/force-source.svg",
      cacheKey: "portrait:force-source",
      sourceRenderKind: "svg" as const,
      derivatives: [
        {
          storagePath: "runtime/force-source.reader.webp",
          url: "https://example.supabase.co/storage/v1/object/public/runtime/force-source.reader.webp",
          cacheKey: "portrait:force-source:webp",
          contentType: "image/webp",
          renderKind: "bitmap" as const,
          width: 100,
          height: 200,
          hash: "webp123",
          derivativeOf: "runtime/force-source.svg"
        }
      ]
    };

    setReaderPortraitDebugRenderModeOverrides([
      {
        storagePathIncludes: "force-source",
        mode: "source-svg-image"
      }
    ]);

    await ensureSceneAssetsReady("scene_force_source", [assetRef]);

    expect(getAssetRenderMode(assetRef)).toBe("source-svg-image");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/public/runtime/force-source.svg"
    );
  });

  it("strict mode fails loudly instead of silently falling back to source SVG", async () => {
    vi.stubGlobal("__DEV__", true);
    globalThis.__OCNOER_READER_STRICT_BITMAP_DERIVATIVES = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "image/svg+xml",
          body: '<svg width="100" height="200"><path d="M0 0h100v200H0z" /></svg>'
        })
      )
    );
    const { ensureSceneAssetsReady } = await import("./imagePreload");
    const result = await ensureSceneAssetsReady("scene_strict", [
      {
        role: "portrait",
        url: "https://example.supabase.co/storage/v1/object/public/runtime/strict.svg",
        storagePath: "runtime/strict.svg",
        cacheKey: "portrait:strict",
        sourceRenderKind: "svg"
      }
    ]);

    expect(result.status).toBe("error");
    expect(result.errors[0]?.message).toContain(
      "Strict bitmap derivatives blocked portrait"
    );
  });

  it("can force every character portrait to the local bitmap test path", async () => {
    vi.stubGlobal("__DEV__", true);
    globalThis.__OCNOER_READER_FORCE_ALL_CHARACTER_PORTRAITS_TO_LOCAL_TEST_BITMAP = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const {
      ensureSceneAssetsReady,
      getAssetRenderMode,
      getCachedAssetUri,
      getReaderAssetRenderDiagnostics
    } = await import("./imagePreload");
    const assetRef = {
      role: "portrait" as const,
      url: "https://example.supabase.co/storage/v1/object/public/runtime/forced.svg",
      storagePath: "runtime/forced.svg",
      cacheKey: "portrait:forced",
      sourceRenderKind: "svg" as const
    };

    const result = await ensureSceneAssetsReady("scene_forced_bitmap", [
      assetRef
    ]);

    expect(result.status).toBe("success");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAssetRenderMode(assetRef)).toBe("bitmap-derivative");
    expect(getCachedAssetUri(assetRef)?.startsWith("data:image/webp")).toBe(
      true
    );
    expect(getReaderAssetRenderDiagnostics(assetRef)).toMatchObject({
      PORTRAIT_RENDER_MODE: "bitmap-derivative",
      derivativeAssetSelected: true,
      sourceSvgFallbackUsed: false
    });
    expect(mockLoadAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining("data:image/webp")
      })
    );
  });
});
