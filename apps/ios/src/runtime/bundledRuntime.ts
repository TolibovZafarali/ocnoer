import type { RuntimeJsonFetcher } from "@ocnoer/story-core";

export const BUNDLED_RUNTIME_ORIGIN = "ocnoer-bundle://";

type BundledRuntimeInput = {
  documents: Record<string, unknown>;
  mediaModules: Record<string, number>;
  resolveMediaUri: (moduleId: number) => Promise<string>;
};

function getStoragePath(value: string) {
  const marker = "/storage/v1/object/public/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return decodeURIComponent(
      value.slice(markerIndex + marker.length).split(/[?#]/)[0]
    );
  }
  return value;
}

export function createBundledRuntimeFetcher(
  input: BundledRuntimeInput
): RuntimeJsonFetcher {
  const assetPromises = new Map<string, Promise<string>>();
  const documentPromises = new Map<string, Promise<unknown>>();

  async function resolveValue(value: unknown, key = ""): Promise<unknown> {
    if (typeof value === "string") {
      const storagePath = getStoragePath(value);
      const moduleId = input.mediaModules[storagePath];
      if (moduleId !== undefined) {
        let promise = assetPromises.get(storagePath);
        if (!promise) {
          promise = input.resolveMediaUri(moduleId).then((uri) => {
            if (!uri.startsWith("file://")) {
              throw new Error(
                `Bundled media did not resolve to a local file: ${storagePath}`
              );
            }
            return uri;
          });
          assetPromises.set(storagePath, promise);
        }
        return promise;
      }
      if (Object.hasOwn(input.documents, storagePath)) return storagePath;
      if (value && /(?:path|url|uri)$/i.test(key)) {
        throw new Error(`Unresolved bundled media reference: ${key}`);
      }
      return value;
    }
    if (Array.isArray(value))
      return Promise.all(value.map((entry) => resolveValue(entry, key)));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, child]) => [
            key,
            await resolveValue(child, key)
          ])
        )
      );
    }
    return value;
  }

  return async (url) => {
    const storagePath = getStoragePath(url);
    if (!Object.hasOwn(input.documents, storagePath)) {
      throw new Error(`Bundled runtime document is missing: ${storagePath}`);
    }
    let promise = documentPromises.get(storagePath);
    if (!promise) {
      promise = resolveValue(input.documents[storagePath]);
      documentPromises.set(storagePath, promise);
    }
    return { ok: true, status: 200, json: () => promise };
  };
}
