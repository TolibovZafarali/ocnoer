import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export default function PlayerPlayPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Player Surface</h1>
          <p className="mt-3 text-slate-700">
            Authenticated player-only area for milestone 2.
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
