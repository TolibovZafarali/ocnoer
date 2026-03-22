import Link from "next/link";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/actions/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import {
  AdminThemeProvider,
  AdminThemeToggle
} from "@/components/admin/admin-theme";
import { Button } from "@/components/ui/button";

type AdminAreaLayoutProps = {
  children: ReactNode;
};

export default function AdminAreaLayout({ children }: AdminAreaLayoutProps) {
  return (
    <AdminThemeProvider>
      <div className="admin-area-shell min-h-screen bg-[linear-gradient(180deg,#f5f7fb_0%,#eef3f9_100%)]">
        <header className="admin-area-header border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <Link href="/admin/chapters" className="text-xl font-semibold text-slate-950">
                Ocnoer Admin
              </Link>
              <p className="text-sm text-slate-600">
                File-backed story authoring with generated runtime JSON.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <AdminNav />
              <div className="flex items-center gap-2">
                <AdminThemeToggle />
                <form action={signOutAction}>
                  <Button type="submit" variant="outline">
                    Log out
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </header>
        {children}
      </div>
    </AdminThemeProvider>
  );
}
