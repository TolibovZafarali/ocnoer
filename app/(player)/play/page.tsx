import { preload } from "react-dom";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";

import { signOutPlayerAction } from "@/app/(player)/play/actions";
import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";
import { Button } from "@/components/ui/button";
import { getPlayerSession } from "@/lib/auth/player";
import worldMapImage from "@/lore/Thaloraz.webp";
import {
  getPlayerRuntimeSceneAssetUrls,
  getRuntimeBootstrapConfig,
  loadPlayerRuntimeBootstrap
} from "@/lib/story/runtime";

function getPlayerGateBackgroundStyle(): CSSProperties {
  return {
    background:
      "radial-gradient(circle at 20% 0%, #12192d 0%, #05070f 55%, #03050c 100%)"
  };
}

function PlayerUnavailableCard(props: { canSignOut?: boolean }) {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-8 text-slate-100"
      style={getPlayerGateBackgroundStyle()}
    >
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Ocnoer
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Story Unavailable
          </h1>
          <p className="text-sm text-slate-300">
            The player is temporarily unavailable. Please try again in a moment.
          </p>
          <p className="text-sm text-slate-400">
            If this keeps happening, ask the administrator to check the server
            logs for the exact player render error.
          </p>
        </div>

        {props.canSignOut ? (
          <form action={signOutPlayerAction} className="mt-5">
            <Button type="submit" className="w-full">
              Sign Out
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default async function PlayerPlayPage() {
  const session = await getPlayerSession();

  if (!session.player) {
    redirect("/");
  }

  try {
    const runtime = getRuntimeBootstrapConfig();
    const bootstrap = await loadPlayerRuntimeBootstrap({
      manifestPath: runtime.manifestPath,
      supabaseUrl: runtime.supabaseUrl
    });
    const initialSceneAssetUrls = getPlayerRuntimeSceneAssetUrls({
      supabaseUrl: runtime.supabaseUrl,
      bundle: bootstrap.initialBundle,
      readerState: bootstrap.initialReaderState
    });
    const initialPreloadUrls = new Set(
      [
        ...initialSceneAssetUrls,
        ...Object.values(bootstrap.initialAssetUrls)
      ].filter((assetUrl): assetUrl is string => Boolean(assetUrl))
    );

    initialPreloadUrls.forEach((assetUrl) => {
      preload(assetUrl, {
        as: "image"
      });
    });

    preload(worldMapImage.src, {
      as: "image",
      fetchPriority: "high"
    });

    return (
      <main className="relative min-h-screen overflow-hidden bg-black text-slate-50">
        <PlayerStoryReader
          manifestPath={runtime.manifestPath}
          progressStorageKey={`ocnoer:player-progress:${session.player.id}`}
          supabaseUrl={runtime.supabaseUrl}
          initialManifest={bootstrap.initialManifest}
          initialBundle={bootstrap.initialBundle}
          initialReaderState={bootstrap.initialReaderState}
          initialCatName={session.player.catName}
          initialCatNameLocked={session.player.catNameLocked}
        />
      </main>
    );
  } catch (error) {
    console.error("Player page render failed.", error);
    return <PlayerUnavailableCard canSignOut />;
  }
}
