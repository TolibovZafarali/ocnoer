import { NextResponse } from "next/server";

import { requireMobilePlayerSession } from "@/lib/auth/mobile-player-api";
import {
  PlayerProfileError,
  setPlayerProfileCatNameOnce
} from "@/lib/player-profiles";

export async function PATCH(request: Request) {
  const session = await requireMobilePlayerSession(request);

  if (!session.ok) {
    return session.response;
  }

  const body = (await request.json().catch(() => null)) as {
    catName?: unknown;
  } | null;
  const catName = typeof body?.catName === "string" ? body.catName : "";

  try {
    const result = await setPlayerProfileCatNameOnce({
      playerId: session.player.id,
      catName
    });

    return NextResponse.json({
      updated: result.updated,
      player: {
        ...session.player,
        catName: result.catName,
        catNameLocked: result.catNameLocked
      }
    });
  } catch (error) {
    if (error instanceof PlayerProfileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Unable to save cat name right now." },
      { status: 500 }
    );
  }
}
