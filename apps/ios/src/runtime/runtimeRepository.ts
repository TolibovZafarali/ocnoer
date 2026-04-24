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
    loadChapter,
    loadSession: (input) =>
      loadPlayerRuntimeSession({
        manifestPath: config.manifestPath,
        supabaseUrl: config.supabaseUrl,
        progress: input.progress,
        initialManifest: input.initialManifest,
        loadChapter,
        fetcher: mobileRuntimeFetcher
      })
  };
}
