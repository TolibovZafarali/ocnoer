import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbe7f5_0%,#f8fafc_56%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
              File-Based Story Runtime
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950">
              Ocnoer reads from generated chapter JSON and persistent media only.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-700">
              The public player consumes static runtime bundles. Admin authoring stays behind
              a single password gate and writes file-based content plus media into persistent storage.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/play">Open Player</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/admin/login">Admin Login</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.3)]">
            <h2 className="text-xl font-semibold text-slate-950">Current shape</h2>
            <div className="mt-5 space-y-4 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-900">Admin</p>
                <p className="mt-1">Characters, emotions, assets, chapters, scenes, and dialogue are authored through server actions that regenerate runtime JSON on every save.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-900">Storage</p>
                <p className="mt-1">Media binaries live in persistent storage only. JSON stores metadata and file paths.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-900">Player</p>
                <p className="mt-1">Progress is localStorage-only and keyed by stable dialogue IDs so edits are less fragile.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
