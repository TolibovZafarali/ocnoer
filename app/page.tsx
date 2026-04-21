import { redirect } from "next/navigation";

import { HomePlayerGate } from "@/app/home-player-gate";
import { getPlayerSession } from "@/lib/auth/player";

export default async function HomePage() {
  const session = await getPlayerSession();

  if (session.player) {
    redirect("/play");
  }

  return <HomePlayerGate />;
}
