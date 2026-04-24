import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { PLAYER_SESSION_COOKIE_NAME } from "@/lib/auth/player";
import { getBearerToken } from "@/lib/auth/mobile-player-api";
import {
  resolvePlayerSessionToken,
  type PlayerIdentityPayload
} from "@/lib/auth/player-session";

export type PlayerApiSession =
  | {
      ok: true;
      player: PlayerIdentityPayload;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requirePlayerApiSession(
  request: Request
): Promise<PlayerApiSession> {
  const bearerToken = getBearerToken(request);
  const cookieStore = await cookies();
  const cookieToken =
    cookieStore.get(PLAYER_SESSION_COOKIE_NAME)?.value ?? null;
  const session = await resolvePlayerSessionToken(bearerToken ?? cookieToken);

  if (!session.player) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return {
    ok: true,
    player: session.player
  };
}
