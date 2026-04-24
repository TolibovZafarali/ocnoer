import { NextResponse } from "next/server";

import {
  createPlayerSessionToken,
  resolvePlayerSessionToken,
  type PlayerIdentityPayload
} from "@/lib/auth/player-session";

export type MobilePlayerSessionResponse = {
  session: {
    token: string;
    expiresAt: string;
  };
  player: PlayerIdentityPayload;
};

export type MobilePlayerProfileResponse = {
  player: PlayerIdentityPayload;
};

export function createMobilePlayerSessionResponse(
  player: PlayerIdentityPayload
): MobilePlayerSessionResponse {
  const sessionToken = createPlayerSessionToken({
    playerId: player.id
  });

  return {
    session: {
      token: sessionToken.token,
      expiresAt: sessionToken.expiresAt
    },
    player
  };
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireMobilePlayerSession(request: Request) {
  const token = getBearerToken(request);
  const session = await resolvePlayerSessionToken(token);

  if (!session.player) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return {
    ok: true as const,
    player: session.player,
    expiresAt: session.expiresAt,
    token
  };
}
