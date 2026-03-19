import Link from "next/link";
import { preload } from "react-dom";

import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";
import { Button } from "@/components/ui/button";
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
            Runtime Player
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ocnoer</h1>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/login">Admin</Link>
          </Button>
        </div>
      </div>

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
