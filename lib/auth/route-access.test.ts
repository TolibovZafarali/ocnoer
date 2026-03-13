import { describe, expect, it } from "vitest";

import { decideRouteAccess } from "@/lib/auth/route-access";

describe("decideRouteAccess", () => {
  it("allows authenticated users with the required role", () => {
    expect(
      decideRouteAccess({
        requiredRole: "admin",
        isAuthenticated: true,
        role: "admin"
      })
    ).toEqual({ type: "allow" });
  });

  it("redirects unauthenticated users to sign-in", () => {
    expect(
      decideRouteAccess({
        requiredRole: "player",
        isAuthenticated: false,
        role: null
      })
    ).toEqual({ type: "redirect_to_sign_in", reason: "unauthenticated" });
  });

  it("redirects to role-config sign-in when role is missing", () => {
    expect(
      decideRouteAccess({
        requiredRole: "player",
        isAuthenticated: true,
        role: null
      })
    ).toEqual({ type: "redirect_to_sign_in", reason: "role_config" });
  });

  it("redirects authenticated users away from unauthorized route surfaces", () => {
    expect(
      decideRouteAccess({
        requiredRole: "admin",
        isAuthenticated: true,
        role: "player"
      })
    ).toEqual({
      type: "redirect_to_role_home",
      to: "/play"
    });
  });
});
