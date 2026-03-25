import { NextResponse } from "next/server";

import { getPlayerSession } from "@/lib/auth/player";
import {
  PlayerProfileError,
  setPlayerProfileCatNameOnce
} from "@/lib/player-profiles";

export async function POST(request: Request) {
  const session = await getPlayerSession();

  if (!session.player) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        catName?: unknown;
      }
    | null;
  const catName = typeof body?.catName === "string" ? body.catName : "";

  try {
    const result = await setPlayerProfileCatNameOnce({
      playerId: session.player.id,
      catName
    });

    return NextResponse.json({
      updated: result.updated,
      catName: result.catName,
      catNameLocked: result.catNameLocked
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
