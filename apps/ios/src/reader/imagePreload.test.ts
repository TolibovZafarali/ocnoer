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
    vi.restoreAllMocks();
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

  it("detects extensionless embedded-raster SVGs with generic content types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createResponse({
          contentType: "application/octet-stream",
          body: '<svg width="900" height="1400" viewBox="0 0 900 1400"><image x="120" y="80" width="640" height="1280" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" /></svg>'
        })
      )
    );
    const {
      ensureSceneAssetsReady,
      getAssetLayoutMetrics,
      getCachedAssetUri,
      getAssetRenderKind
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
    expect(getCachedAssetUri(assetRef)?.endsWith(".embedded.png")).toBe(true);
    expect(getAssetRenderKind(assetRef)).toBe("bitmap");
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
