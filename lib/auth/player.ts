import { cookies } from "next/headers";

import {
  authenticatePlayerSecret,
  createPlayerSessionToken,
  PLAYER_SESSION_MAX_AGE_SECONDS,
  resolvePlayerSessionToken
} from "@/lib/auth/player-session";

const PLAYER_SESSION_COOKIE_NAME = "ocnoer_player_session";

async function setPlayerSessionCookie(playerId: string) {
  const cookieStore = await cookies();
  const sessionToken = createPlayerSessionToken({
    playerId
  });

  cookieStore.set(PLAYER_SESSION_COOKIE_NAME, sessionToken.token, {
    httpOnly: true,
    maxAge: PLAYER_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function clearPlayerSession() {
  const cookieStore = await cookies();

  cookieStore.set(PLAYER_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function signInAsPlayerSecret(secretAttempt: string) {
  const result = await authenticatePlayerSecret(secretAttempt);

  if (!result.ok) {
    return result;
  }

  await setPlayerSessionCookie(result.player.id);

  return result;
}

export async function getPlayerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLAYER_SESSION_COOKIE_NAME)?.value ?? null;

  return resolvePlayerSessionToken(token);
}
