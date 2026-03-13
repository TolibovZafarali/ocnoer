import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth/guards";

type PlayerLayoutProps = {
  children: ReactNode;
};

export default async function PlayerLayout({ children }: PlayerLayoutProps) {
  await requireRole("player");

  return <>{children}</>;
}
