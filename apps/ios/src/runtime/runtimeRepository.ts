import {
  createRuntimeChapterLoader,
  loadPlayerRuntimeBootstrap,
  type PlayerRuntimeBootstrap,
  type RuntimeChapterBundle,
  type RuntimeJsonFetcher,
  type RuntimeManifest
} from "@ocnoer/story-core";

import {
  getMobileRuntimeConfig,
  type MobileRuntimeConfig
} from "../config/runtime";

export type MobileRuntimeRepository = {
  config: MobileRuntimeConfig;
  loadBootstrap: () => Promise<PlayerRuntimeBootstrap>;
  loadChapter: (
    manifest: RuntimeManifest,
    chapterId: string
  ) => Promise<RuntimeChapterBundle>;
};

const mobileRuntimeFetcher: RuntimeJsonFetcher = async (url) => fetch(url);

export function createMobileRuntimeRepository(
  config: MobileRuntimeConfig = getMobileRuntimeConfig()
): MobileRuntimeRepository {
  const chapterCache = new Map<string, RuntimeChapterBundle>();
  const loadChapter = createRuntimeChapterLoader({
    supabaseUrl: config.supabaseUrl,
    cache: chapterCache,
    fetcher: mobileRuntimeFetcher
  });

  return {
    config,
    loadBootstrap: () =>
      loadPlayerRuntimeBootstrap({
        manifestPath: config.manifestPath,
        supabaseUrl: config.supabaseUrl,
        loadChapter,
        fetcher: mobileRuntimeFetcher
      }),
    loadChapter
  };
}
