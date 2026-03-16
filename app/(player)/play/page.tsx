import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";
import {
  PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
} from "@/lib/story/repository";
import {
  getPlayerRuntimeBootstrap,
  PublishedRuntimeError
} from "@/lib/story/runtime";

export default async function PlayerPlayPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const userEmail = data.user?.email ?? null;
  let runtime = null;
  let runtimeMessage: string | null = null;

  if (userEmail) {
    try {
      runtime = await getPlayerRuntimeBootstrap(userEmail);
    } catch (error) {
      if (
        error instanceof PublishedRuntimeError &&
        error.message === PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
      ) {
        runtimeMessage = error.message;
      } else {
        throw error;
      }
    }
  }

  const { url: supabaseUrl } = getSupabaseEnv();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Story Reader</h1>
          <p className="mt-3 text-slate-700">
            Read the published story with local-first progress.
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {runtime ? (
          <PlayerStoryReader
            initialBundle={runtime.initialBundle}
            initialServerCheckpoint={runtime.serverCheckpoint}
            manifest={runtime.manifest}
            progressStorageKey={`ocnoer:reading-progress:${runtime.userId}`}
            publishedVersionId={runtime.pinnedVersionId}
            supabaseUrl={supabaseUrl}
          />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <h2 className="text-xl font-semibold">No published story available</h2>
            <p className="mt-2 text-sm text-slate-700">
              {runtimeMessage ??
                "Publish a story version in admin before opening the player reader."}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
