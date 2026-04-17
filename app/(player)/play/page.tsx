import { preload } from "react-dom";
import type { CSSProperties } from "react";

import {
  signInPlayerAction,
  signOutPlayerAction
} from "@/app/(player)/play/actions";
import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";
import { Button } from "@/components/ui/button";
import { getPlayerSession } from "@/lib/auth/player";
import worldMapImage from "@/lore/world-map.jpg";
import {
  getRuntimeBootstrapConfig,
  loadPlayerRuntimeBootstrap
} from "@/lib/story/runtime";

type PlayerPlayPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

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

export default async function PlayerPlayPage({ searchParams }: PlayerPlayPageProps) {
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const status = getParam(params.status);
  const message = getParam(params.message);

  try {
    const session = await getPlayerSession();

    if (!session.player) {
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
                Enter Story
              </h1>
              <p className="text-sm text-slate-300">
                Enter your password to access the reader.
              </p>
            </div>

            {status === "error" && message ? (
              <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
                {message}
              </p>
            ) : null}
            {status === "success" && message ? (
              <p className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
                {message}
              </p>
            ) : null}

            <form action={signInPlayerAction} className="mt-5 space-y-4">
              <label htmlFor="player-password" className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">
                  Password
                </span>
                <input
                  id="player-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-slate-100 outline-none transition focus:border-white/35 focus:ring-2 focus:ring-white/20"
                  required
                />
              </label>
              <Button type="submit" className="w-full">
                Enter
              </Button>
            </form>
          </section>
        </main>
      );
    }

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
        <div className="absolute right-3 top-3 z-40">
          <form action={signOutPlayerAction}>
            <Button type="submit" size="sm" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
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
