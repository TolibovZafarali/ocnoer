import { PlayerStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MIN_FIRST_NAME_LENGTH = 1;
const MAX_FIRST_NAME_LENGTH = 80;
const MIN_CAT_NAME_LENGTH = 1;
const MAX_CAT_NAME_LENGTH = 80;
export const PLAYER_ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const PLAYER_PRESENCE_TOUCH_INTERVAL_MS = 60 * 1000;

export class PlayerProfileError extends Error {}

export type PlayerProfileSessionData = {
  id: string;
  firstName: string;
  catName: string | null;
  catNameLocked: boolean;
  status: PlayerStatus;
};

export function normalizePlayerUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isPlayerOnline(
  lastSeenAt: Date | string | null | undefined,
  now = new Date()
) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenMs =
    lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(lastSeenAt);

  return (
    Number.isFinite(lastSeenMs) &&
    lastSeenMs >= now.getTime() - PLAYER_ONLINE_WINDOW_MS
  );
}

function normalizeOptionalText(value: string | null) {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function assertValidFirstName(value: string) {
  const normalized = value.trim();

  if (
    normalized.length < MIN_FIRST_NAME_LENGTH ||
    normalized.length > MAX_FIRST_NAME_LENGTH
  ) {
    throw new PlayerProfileError(
      `First name must be ${MIN_FIRST_NAME_LENGTH}-${MAX_FIRST_NAME_LENGTH} characters.`
    );
  }

  return normalized;
}

function assertValidUsername(value: string) {
  const normalized = value.trim();

  if (
    normalized.length < MIN_USERNAME_LENGTH ||
    normalized.length > MAX_USERNAME_LENGTH
  ) {
    throw new PlayerProfileError(
      `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters.`
    );
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new PlayerProfileError(
      "Username may contain only letters, numbers, dot, underscore, or dash."
    );
  }

  return normalized;
}

function assertValidCatName(value: string) {
  const normalized = value.trim();

  if (
    normalized.length < MIN_CAT_NAME_LENGTH ||
    normalized.length > MAX_CAT_NAME_LENGTH
  ) {
    throw new PlayerProfileError(
      `Cat name must be ${MIN_CAT_NAME_LENGTH}-${MAX_CAT_NAME_LENGTH} characters.`
    );
  }

  return normalized;
}

function toPlayerProfileError(error: unknown) {
  if (getPrismaErrorCode(error) === "P2002") {
    return new PlayerProfileError(
      "Username already exists. Usernames are case-insensitive."
    );
  }

  return error;
}

function getPrismaErrorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  if (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

export async function listPlayerProfiles() {
  return prisma.playerProfile.findMany({
    include: {
      readingProgress: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function touchPlayerPresence(playerId: string, now = new Date()) {
  const staleBefore = new Date(
    now.getTime() - PLAYER_PRESENCE_TOUCH_INTERVAL_MS
  );

  return prisma.playerProfile.updateMany({
    where: {
      id: playerId,
      OR: [
        {
          lastSeenAt: null
        },
        {
          lastSeenAt: {
            lt: staleBefore
          }
        }
      ]
    },
    data: {
      lastSeenAt: now
    }
  });
}

export async function createPlayerProfile(input: {
  firstName: string;
  username: string;
  catName: string | null;
  status: PlayerStatus;
}) {
  const firstName = assertValidFirstName(input.firstName);
  const username = assertValidUsername(input.username);
  const usernameNormalized = normalizePlayerUsername(username);
  const catName = normalizeOptionalText(input.catName);

  try {
    return await prisma.playerProfile.create({
      data: {
        firstName,
        username,
        usernameNormalized,
        catName,
        catNameLocked: catName != null,
        status: input.status
      }
    });
  } catch (error) {
    throw toPlayerProfileError(error);
  }
}

export async function updatePlayerProfile(input: {
  playerId: string;
  firstName: string;
  username: string;
  catName: string | null;
  status: PlayerStatus;
}) {
  const firstName = assertValidFirstName(input.firstName);
  const username = assertValidUsername(input.username);
  const usernameNormalized = normalizePlayerUsername(username);
  const catName = normalizeOptionalText(input.catName);
  const existingProfile = await prisma.playerProfile.findUnique({
    where: {
      id: input.playerId
    },
    select: {
      id: true
    }
  });

  if (!existingProfile) {
    throw new PlayerProfileError("Player profile not found.");
  }

  const catNameLocked = catName != null;

  try {
    return await prisma.playerProfile.update({
      where: {
        id: input.playerId
      },
      data: {
        firstName,
        username,
        usernameNormalized,
        catName,
        catNameLocked,
        status: input.status
      }
    });
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2025") {
      throw new PlayerProfileError("Player profile not found.");
    }

    throw toPlayerProfileError(error);
  }
}

export async function updatePlayerProfileStatus(input: {
  playerId: string;
  status: PlayerStatus;
}) {
  try {
    return await prisma.playerProfile.update({
      where: {
        id: input.playerId
      },
      data: {
        status: input.status
      }
    });
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2025") {
      throw new PlayerProfileError("Player profile not found.");
    }

    throw error;
  }
}

export async function findPlayerProfileForSecret(input: { secret: string }) {
  const normalizedSecret = normalizePlayerUsername(input.secret);

  if (normalizedSecret.length === 0) {
    return null;
  }

  return prisma.playerProfile.findUnique({
    where: {
      usernameNormalized: normalizedSecret
    },
    select: {
      id: true,
      firstName: true,
      catName: true,
      catNameLocked: true,
      status: true
    }
  });
}

export async function getPlayerProfileSessionData(playerId: string) {
  return prisma.playerProfile.findUnique({
    where: {
      id: playerId
    },
    select: {
      id: true,
      firstName: true,
      catName: true,
      catNameLocked: true,
      status: true
    }
  });
}

export async function setPlayerProfileCatNameOnce(input: {
  playerId: string;
  catName: string;
}) {
  const catName = assertValidCatName(input.catName);

  const updated = await prisma.playerProfile.updateMany({
    where: {
      id: input.playerId,
      OR: [
        {
          catNameLocked: false
        },
        {
          catName: null
        }
      ],
      status: PlayerStatus.ACTIVE
    },
    data: {
      catName,
      catNameLocked: true
    }
  });

  if (updated.count === 1) {
    return {
      updated: true,
      catName,
      catNameLocked: true
    };
  }

  const existing = await prisma.playerProfile.findUnique({
    where: {
      id: input.playerId
    },
    select: {
      catName: true,
      catNameLocked: true,
      status: true
    }
  });

  if (!existing) {
    throw new PlayerProfileError("Player profile not found.");
  }

  return {
    updated: false,
    catName: existing.catName,
    catNameLocked: existing.catNameLocked,
    status: existing.status
  };
}
