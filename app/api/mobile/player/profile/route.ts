import { NextResponse } from "next/server";

import { requireMobilePlayerSession } from "@/lib/auth/mobile-player-api";

export async function GET(request: Request) {
  const session = await requireMobilePlayerSession(request);

  if (!session.ok) {
    return session.response;
  }

  return NextResponse.json({
    player: session.player
  });
}
