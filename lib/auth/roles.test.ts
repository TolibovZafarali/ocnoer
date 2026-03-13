import { describe, expect, it } from "vitest";

import { getRoleFromAppMetadata, getRoleHomePath, parseRole } from "@/lib/auth/roles";

describe("parseRole", () => {
  it("returns valid roles", () => {
    expect(parseRole("admin")).toBe("admin");
    expect(parseRole("player")).toBe("player");
  });

  it("rejects invalid values", () => {
    expect(parseRole("owner")).toBeNull();
    expect(parseRole(null)).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
});

describe("getRoleFromAppMetadata", () => {
  it("extracts role from app metadata", () => {
    expect(getRoleFromAppMetadata({ app_metadata: { role: "admin" } })).toBe("admin");
    expect(getRoleFromAppMetadata({ app_metadata: { role: "player" } })).toBe("player");
  });

  it("returns null for missing or invalid role", () => {
    expect(getRoleFromAppMetadata({ app_metadata: { role: "invalid" } })).toBeNull();
    expect(getRoleFromAppMetadata({ app_metadata: null })).toBeNull();
  });
});

describe("getRoleHomePath", () => {
  it("maps each role to its route surface", () => {
    expect(getRoleHomePath("admin")).toBe("/admin");
    expect(getRoleHomePath("player")).toBe("/play");
  });
});
