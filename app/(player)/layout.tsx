import type { ReactNode } from "react";

type PlayerLayoutProps = {
  children: ReactNode;
};

export default async function PlayerLayout({ children }: PlayerLayoutProps) {
  return <>{children}</>;
}
