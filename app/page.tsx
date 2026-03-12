import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Milestone 1
        </p>
        <h1 className="text-4xl font-semibold text-slate-900">Ocnoer</h1>
        <p className="text-base text-slate-700">
          Bootstrap scaffold is running. Choose a route surface to continue.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/play">Open Player Surface</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Open Admin Surface</Link>
        </Button>
      </div>
    </main>
  );
}
