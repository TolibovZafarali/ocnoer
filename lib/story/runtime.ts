import {
  getManifestChapterById,
  getPlayerRuntimeAssetUrls,
  toPublicStorageUrl,
  resolvePlayableRuntimePosition,
  type PlayerProgress,
  type PlayerRuntimeAssetUrls,
  type ReaderState,
  type RuntimeChapterBundle,
  type RuntimeChapterLoader
} from "@ocnoer/story-core";
import type { RuntimeManifest } from "@ocnoer/story-core";
import { getSupabaseEnv, getSupabaseServerEnv } from "@/lib/supabase/env";

export {
  decidePlayerResumeAction,
  getPlayerRuntimeAssetUrls,
  getPlayerRuntimeSceneAssetUrls,
  toPublicStorageUrl
} from "@ocnoer/story-core";
export type {
  PlayerResumeAction,
  PlayerRuntimeAssetUrls
} from "@ocnoer/story-core";

export type PlayerRuntimeBootstrap = {
  initialManifest: RuntimeManifest;
  initialBundle: RuntimeChapterBundle | null;
  initialReaderState: ReaderState | null;
  initialAssetUrls: PlayerRuntimeAssetUrls;
};

export type PlayerRuntimeSession = {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
};

export function getRuntimeManifestStoragePath() {
  const { runtimeBucket } = getSupabaseServerEnv();

  return `${runtimeBucket}/runtime/manifest.json`;
}

export function getRuntimeBootstrapConfig() {
  const { url } = getSupabaseEnv();

  return {
    manifestPath: getRuntimeManifestStoragePath(),
    supabaseUrl: url
  };
}

export function createRuntimeChapterLoader(input: {
  supabaseUrl: string;
  cache?: Map<string, RuntimeChapterBundle>;
}): RuntimeChapterLoader {
  return async (manifest, chapterId) => {
    const cached = input.cache?.get(chapterId);

    if (cached) {
      return cached;
    }

    const manifestChapter = getManifestChapterById(manifest, chapterId);

    if (!manifestChapter) {
      throw new Error(
        "Requested chapter is not available in runtime manifest."
      );
    }

    const loadedBundle = await fetchRuntimeJson<RuntimeChapterBundle>(
      input.supabaseUrl,
      manifestChapter.bundlePath
    );

    input.cache?.set(chapterId, loadedBundle);
    return loadedBundle;
  };
}

export async function loadPlayerRuntimeSession(input: {
  manifestPath: string;
  supabaseUrl: string;
  progress: Pick<
    PlayerProgress,
    "chapterId" | "sceneId" | "dialogueEntryId"
  > | null;
  initialManifest?: RuntimeManifest | null;
  loadChapter?: RuntimeChapterLoader;
}): Promise<PlayerRuntimeSession> {
  const manifest =
    input.initialManifest ??
    (await fetchRuntimeJson<RuntimeManifest>(
      input.supabaseUrl,
      input.manifestPath
    ));

  if (!manifest.firstChapterId) {
    return {
      manifest,
      bundle: null,
      readerState: null
    };
  }

  const loadChapter =
    input.loadChapter ??
    createRuntimeChapterLoader({
      supabaseUrl: input.supabaseUrl
    });
  const resolvedRuntime = await resolvePlayableRuntimePosition({
    manifest,
    loadChapter,
    progress: input.progress,
    startChapterId: manifest.firstChapterId
  });

  return {
    manifest,
    bundle: resolvedRuntime?.bundle ?? null,
    readerState: resolvedRuntime?.state ?? null
  };
}

export async function fetchRuntimeJson<T>(
  supabaseUrl: string,
  storagePath: string
): Promise<T> {
  const url = toPublicStorageUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error("Runtime storage path is invalid.");
  }

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to load runtime JSON (${response.status}).`);
  }

  return (await response.json()) as T;
}

export async function loadPlayerRuntimeBootstrap(input: {
  manifestPath: string;
  supabaseUrl: string;
}): Promise<PlayerRuntimeBootstrap> {
  const initialSession = await loadPlayerRuntimeSession({
    manifestPath: input.manifestPath,
    supabaseUrl: input.supabaseUrl,
    progress: null
  });

  return {
    initialManifest: initialSession.manifest,
    initialBundle: initialSession.bundle,
    initialReaderState: initialSession.readerState,
    initialAssetUrls: getPlayerRuntimeAssetUrls({
      supabaseUrl: input.supabaseUrl,
      bundle: initialSession.bundle,
      readerState: initialSession.readerState
    })
  };
}
