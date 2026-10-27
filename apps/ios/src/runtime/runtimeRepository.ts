import { Asset } from "expo-asset";

import {
  createRuntimeChapterLoader,
  loadPlayerRuntimeBootstrap,
  loadPlayerRuntimeSession,
  type PlayerProgress,
  type PlayerRuntimeBootstrap,
  type PlayerRuntimeSession,
  type RuntimeChapterBundle,
  type RuntimeJsonFetcher,
  type RuntimeManifest
} from "@ocnoer/story-core";

import {
  getMobileRuntimeConfig,
  type MobileRuntimeConfig
} from "../config/runtime";
import {
  BUNDLED_RUNTIME_ORIGIN,
  createBundledRuntimeFetcher
} from "./bundledRuntime";
import {
  getBundledDocuments,
  getBundledMediaModules
} from "./generated/storyRegistry";

export type MobileRuntimeRepository = {
  config: MobileRuntimeConfig;
  loadBootstrap: () => Promise<PlayerRuntimeBootstrap>;
  loadChapter: (
    manifest: RuntimeManifest,
    chapterId: string
  ) => Promise<RuntimeChapterBundle>;
  loadSession: (input: {
    progress: Pick<
      PlayerProgress,
      "chapterId" | "sceneId" | "dialogueEntryId"
    > | null;
    initialManifest?: RuntimeManifest | null;
  }) => Promise<PlayerRuntimeSession>;
};

const mobileRuntimeFetcher: RuntimeJsonFetcher = async (url) => fetch(url);

export function createMobileRuntimeRepository(
  config: MobileRuntimeConfig = getMobileRuntimeConfig()
): MobileRuntimeRepository {
  const chapterCache = new Map<string, RuntimeChapterBundle>();
  const fetcher =
    config.supabaseUrl === BUNDLED_RUNTIME_ORIGIN
      ? createBundledRuntimeFetcher({
          documents: getBundledDocuments(),
          mediaModules: getBundledMediaModules(),
          resolveMediaUri: async (moduleId) => {
            const asset = await Asset.fromModule(moduleId).downloadAsync();
            if (!asset.localUri)
              throw new Error(
                "Bundled story media is unavailable on this device."
              );
            return asset.localUri;
          }
        })
      : mobileRuntimeFetcher;
  const loadChapter = createRuntimeChapterLoader({
    supabaseUrl: config.supabaseUrl,
    cache: chapterCache,
    fetcher
  });

  return {
    config,
    loadBootstrap: () =>
      loadPlayerRuntimeBootstrap({
        manifestPath: config.manifestPath,
        supabaseUrl: config.supabaseUrl,
        loadChapter,
        fetcher
      }),
    loadChapter,
    loadSession: (input) =>
      loadPlayerRuntimeSession({
        manifestPath: config.manifestPath,
        supabaseUrl: config.supabaseUrl,
        progress: input.progress,
        initialManifest: input.initialManifest,
        loadChapter,
        fetcher
      })
  };
}
