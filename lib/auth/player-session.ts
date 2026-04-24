import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { PlayerStatus } from "@prisma/client";

import {
  findPlayerProfileForSecret,
  getPlayerProfileSessionData
} from "@/lib/player-profiles";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

export const PLAYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type PlayerIdentityPayload = {
  id: string;
  firstName: string;
  catName: string | null;
  catNameLocked: boolean;
};

export type PlayerSessionValidationResult = {
  player: PlayerIdentityPayload | null;
  expiresAt?: string;
};

export type PlayerSecretSignInResult =
  | {
      ok: true;
      player: PlayerIdentityPayload;
    }
  | {
      ok: false;
    };

type VerifiedPlayerSessionToken = {
  playerId: string;
  issuedAtMs: number;
};

function signPlayerSessionPayload(payload: string) {
  const { serviceRoleKey } = getSupabaseServerEnv();

  return createHmac("sha256", serviceRoleKey)
    .update(payload)
    .digest("base64url");
}

function toPlayerIdentity(profile: {
  id: string;
  firstName: string;
  catName: string | null;
  catNameLocked: boolean;
}): PlayerIdentityPayload {
  return {
    id: profile.id,
    firstName: profile.firstName,
    catName: profile.catName,
    catNameLocked: profile.catNameLocked
  };
}

export function getPlayerSessionExpiresAt(issuedAtMs: number) {
  return new Date(
    issuedAtMs + PLAYER_SESSION_MAX_AGE_SECONDS * 1000
  ).toISOString();
}

export function createPlayerSessionToken(input: {
  playerId: string;
  issuedAtMs?: number;
}) {
  const issuedAtMs = input.issuedAtMs ?? Date.now();
  const payload = `${input.playerId}.${issuedAtMs}.${randomUUID()}`;
  const signature = signPlayerSessionPayload(payload);

  return {
    token: `${payload}.${signature}`,
    issuedAtMs,
    expiresAt: getPlayerSessionExpiresAt(issuedAtMs)
  };
}

export function verifyPlayerSessionToken(
  token: string,
  nowMs = Date.now()
): VerifiedPlayerSessionToken | null {
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
    const isValid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );

    if (!isValid) {
      return null;
    }
  } catch {
    return null;
  }

  const playerId = parts[0]?.trim() ?? "";
  const issuedAtMs = Number(parts[1]);

  if (playerId.length === 0 || !Number.isFinite(issuedAtMs)) {
    return null;
  }

  const maxAgeMs = PLAYER_SESSION_MAX_AGE_SECONDS * 1000;

  if (issuedAtMs > nowMs || nowMs - issuedAtMs > maxAgeMs) {
    return null;
  }

  return {
    playerId,
    issuedAtMs
  };
}

export async function authenticatePlayerSecret(
  secretAttempt: string
): Promise<PlayerSecretSignInResult> {
  const profile = await findPlayerProfileForSecret({
    secret: secretAttempt
  });

  if (!profile || profile.status !== PlayerStatus.ACTIVE) {
    return {
      ok: false
    };
  }

  return {
    ok: true,
    player: toPlayerIdentity(profile)
  };
}

export async function resolvePlayerSessionToken(
  token: string | null
): Promise<PlayerSessionValidationResult> {
  if (!token) {
    return {
      player: null
    };
  }

  const verifiedToken = verifyPlayerSessionToken(token);

  if (!verifiedToken) {
    return {
      player: null
    };
  }

  const profile = await getPlayerProfileSessionData(verifiedToken.playerId);

  if (!profile || profile.status !== PlayerStatus.ACTIVE) {
    return {
      player: null
    };
  }

  return {
    player: toPlayerIdentity(profile),
    expiresAt: getPlayerSessionExpiresAt(verifiedToken.issuedAtMs)
  };
}
