import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getFirstPlayableChapter } from "@/lib/story/repository";
import { PlayerStoryReader } from "@/app/(player)/play/player-story-reader";

export default async function PlayerPlayPage() {
  const chapter = await getFirstPlayableChapter();
  const { url: supabaseUrl } = getSupabaseEnv();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Story Reader</h1>
          <p className="mt-3 text-slate-700">Read the first story chapter in sequence.</p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {chapter ? (
          <PlayerStoryReader chapter={chapter} supabaseUrl={supabaseUrl} />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <h2 className="text-xl font-semibold">No chapter available</h2>
            <p className="mt-2 text-sm text-slate-700">
              Create at least one chapter in admin to start the player reader.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
