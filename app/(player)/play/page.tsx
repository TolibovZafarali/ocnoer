import { preload } from "react-dom";

import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";
import worldMapImage from "@/lore/world-map.jpg";
import {
  getRuntimeBootstrapConfig,
  loadPlayerRuntimeBootstrap
} from "@/lib/story/runtime";

export default async function PlayerPlayPage() {
  const runtime = getRuntimeBootstrapConfig();
  const bootstrap = await loadPlayerRuntimeBootstrap({
    manifestPath: runtime.manifestPath,
    supabaseUrl: runtime.supabaseUrl
  });

  Object.values(bootstrap.initialAssetUrls).forEach((assetUrl) => {
    if (assetUrl) {
      preload(assetUrl, {
        as: "image"
      });
    }
  });

  preload(worldMapImage.src, {
    as: "image",
    fetchPriority: "high"
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-slate-50">
      <PlayerStoryReader
        manifestPath={runtime.manifestPath}
        progressStorageKey="ocnoer:player-progress"
        supabaseUrl={runtime.supabaseUrl}
        initialManifest={bootstrap.initialManifest}
        initialBundle={bootstrap.initialBundle}
        initialReaderState={bootstrap.initialReaderState}
      />
    </main>
  );
}
