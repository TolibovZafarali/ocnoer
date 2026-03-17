import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/app/admin/login/login-form";
import { getAdminPasswordConfigError, hasAdminSession } from "@/lib/auth/admin";

export default async function AdminLoginPage() {
  const configError = getAdminPasswordConfigError();

  if (!configError && (await hasAdminSession())) {
    redirect("/admin/chapters");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dbe7f5_0%,#f8fafc_55%)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)]">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
            Admin Access
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Ocnoer authoring
          </h1>
          <p className="text-sm text-slate-600">
            Enter the single admin password. Successful login sets an HttpOnly
            session cookie for `/admin` routes only.
          </p>
        </div>

        <div className="mt-8">
          <AdminLoginForm disabled={Boolean(configError)} />
        </div>

        {configError ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {configError}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-slate-500">
          Player runtime stays separate at <Link href="/play" className="font-medium text-slate-800 underline">/play</Link>.
        </p>
      </div>
    </main>
  );
}
