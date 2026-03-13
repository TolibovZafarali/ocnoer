export const VALID_ROLES = ["admin", "player"] as const;

export type Role = (typeof VALID_ROLES)[number];

export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") {
    return null;
  }

  return VALID_ROLES.includes(value as Role) ? (value as Role) : null;
}

export function getRoleHomePath(role: Role): "/admin" | "/play" {
  return role === "admin" ? "/admin" : "/play";
}

export function getExpectedRoleForPath(pathname: string): Role | null {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }

  if (pathname.startsWith("/play")) {
    return "player";
  }

  return null;
}

export function getRoleFromAppMetadata(user: {
  app_metadata?: Record<string, unknown> | null;
}): Role | null {
  const metadata = user.app_metadata;

  if (!metadata) {
    return null;
  }

  return parseRole(metadata.role);
}
