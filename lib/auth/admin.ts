import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_SESSION_COOKIE_NAME = "ocnoer_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getConfiguredAdminPassword() {
  const password = process.env.ADMIN_PASSWORD?.trim();

  return password && password.length > 0 ? password : null;
}

export function getAdminPasswordConfigError() {
  return getConfiguredAdminPassword()
    ? null
    : "ADMIN_PASSWORD is not configured. Add it to .env.local and restart the server.";
}

function signSessionPayload(payload: string) {
  const adminPassword = getConfiguredAdminPassword();

  if (!adminPassword) {
    return null;
  }

  return createHmac("sha256", adminPassword)
    .update(payload)
    .digest("base64url");
}

function createSessionToken() {
  const payload = `${Date.now()}.${randomUUID()}`;
  const signature = signSessionPayload(payload);

  if (!signature) {
    return null;
  }

  return `${payload}.${signature}`;
}

function verifySessionToken(token: string) {
  const parts = token.split(".");

  if (parts.length < 3) {
    return false;
  }

  const signature = parts.at(-1);
  const payload = parts.slice(0, -1).join(".");

  if (!signature) {
    return false;
  }

  const expected = signSessionPayload(payload);

  if (!expected) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function signInAsAdmin(passwordAttempt: string) {
  const expectedPassword = getConfiguredAdminPassword();

  if (!expectedPassword) {
    return {
      ok: false as const,
      reason: "missing_password_config" as const
    };
  }

  try {
    const valid = timingSafeEqual(
      Buffer.from(passwordAttempt),
      Buffer.from(expectedPassword)
    );

    if (!valid) {
      return {
        ok: false as const,
        reason: "invalid_password" as const
      };
    }
  } catch {
    return {
      ok: false as const,
      reason: "invalid_password" as const
    };
  }

  const sessionToken = createSessionToken();

  if (!sessionToken) {
    return {
      ok: false as const,
      reason: "missing_password_config" as const
    };
  }

  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return {
    ok: true as const
  };
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function hasAdminSession() {
  if (!getConfiguredAdminPassword()) {
    return false;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  return verifySessionToken(token);
}

export async function requireAdminSession() {
  if (!(await hasAdminSession())) {
    redirect("/admin/login");
  }
}
