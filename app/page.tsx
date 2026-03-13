import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getRoleHomePath } from "@/lib/auth/roles";
import { getSessionRole } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSessionRole();

  if (session.isAuthenticated && session.role) {
    redirect(getRoleHomePath(session.role));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Milestone 2
        </p>
        <h1 className="text-4xl font-semibold text-slate-900">Ocnoer</h1>
        <p className="text-base text-slate-700">
          Private access is enabled. Sign in to continue.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/sign-in">Open Sign-in</Link>
        </Button>
      </div>
    </main>
  );
}
