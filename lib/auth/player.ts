import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { PlayerStatus } from "@prisma/client";
import { cookies } from "next/headers";

import {
  findPlayerProfileForSecret,
  getPlayerProfileSessionData
} from "@/lib/player-profiles";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

const PLAYER_SESSION_COOKIE_NAME = "ocnoer_player_session";
const PLAYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type PlayerSessionData = {
  id: string;
  firstName: string;
  catName: string | null;
  catNameLocked: boolean;
};

function signPlayerSessionPayload(payload: string) {
  const { serviceRoleKey } = getSupabaseServerEnv();

  return createHmac("sha256", serviceRoleKey).update(payload).digest("base64url");
}

function createPlayerSessionToken(playerId: string) {
  const payload = `${playerId}.${Date.now()}.${randomUUID()}`;
  const signature = signPlayerSessionPayload(payload);

  return `${payload}.${signature}`;
}

function verifyPlayerSessionToken(token: string): string | null {
  const parts = token.split(".");

  if (parts.length < 4) {
    return null;
  }

  const signature = parts.at(-1);
  const payload = parts.slice(0, -1).join(".");

  if (!signature) {
    return null;
  }

  const expected = signPlayerSessionPayload(payload);

  try {
    const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!isValid) {
      return null;
    }
  } catch {
    return null;
  }

  const playerId = parts[0]?.trim() ?? "";

  return playerId.length > 0 ? playerId : null;
}

async function setPlayerSessionCookie(playerId: string) {
  const cookieStore = await cookies();

  cookieStore.set(PLAYER_SESSION_COOKIE_NAME, createPlayerSessionToken(playerId), {
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
  const profile = await findPlayerProfileForSecret({
    secret: secretAttempt
  });

  if (!profile || profile.status !== PlayerStatus.ACTIVE) {
    return {
      ok: false as const
    };
  }

  await setPlayerSessionCookie(profile.id);

  return {
    ok: true as const,
    player: {
      id: profile.id,
      firstName: profile.firstName,
      catName: profile.catName,
      catNameLocked: profile.catNameLocked
    }
  };
}

export async function getPlayerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLAYER_SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    return {
      player: null as PlayerSessionData | null
    };
  }

  const playerId = verifyPlayerSessionToken(token);

  if (!playerId) {
    return {
      player: null as PlayerSessionData | null
    };
  }

  const profile = await getPlayerProfileSessionData(playerId);

  if (!profile || profile.status !== PlayerStatus.ACTIVE) {
    return {
      player: null as PlayerSessionData | null
    };
  }

  return {
    player: {
      id: profile.id,
      firstName: profile.firstName,
      catName: profile.catName,
      catNameLocked: profile.catNameLocked
    }
  };
}
