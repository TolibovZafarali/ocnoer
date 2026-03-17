"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navClassName(active: boolean) {
  return [
    "rounded-full px-4 py-2 text-sm font-medium transition",
    active
      ? "bg-slate-950 text-white"
      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
  ].join(" ");
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-3">
      <Link
        href="/admin/chapters"
        className={navClassName(pathname.startsWith("/admin/chapters"))}
      >
        Chapters
      </Link>
      <Link
        href="/admin/characters"
        className={navClassName(pathname.startsWith("/admin/characters"))}
      >
        Characters
      </Link>
      <Link
        href="/admin/assets"
        className={navClassName(pathname.startsWith("/admin/assets"))}
      >
        Assets
      </Link>
    </nav>
  );
}

