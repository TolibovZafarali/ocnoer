import { getSupabaseEnv, getSupabaseServerEnv } from "@/lib/supabase/env";

export {
  createRuntimeChapterLoader,
  decidePlayerResumeAction,
  fetchRuntimeJson,
  getPlayerRuntimeAssetUrls,
  getPlayerRuntimeSceneAssetUrls,
  getPlayerRuntimeStageCharacters,
  loadPlayerRuntimeBootstrap,
  loadPlayerRuntimeSession,
  toPublicStorageUrl
} from "@ocnoer/story-core";
export type {
  PlayerRuntimeStageCharacter,
  PlayerRuntimeStagePlacement,
  PlayerResumeAction,
  PlayerRuntimeAssetUrls,
  PlayerRuntimeBootstrap,
  PlayerRuntimeSession,
  RuntimeJsonFetcher
} from "@ocnoer/story-core";

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
