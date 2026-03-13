import { getRoleHomePath, type Role } from "@/lib/auth/roles";

export type RouteAccessDecision =
  | { type: "allow" }
  | { type: "redirect_to_sign_in"; reason: "unauthenticated" | "role_config" }
  | { type: "redirect_to_role_home"; to: "/admin" | "/play" };

export function decideRouteAccess(input: {
  requiredRole: Role;
  isAuthenticated: boolean;
  role: Role | null;
}): RouteAccessDecision {
  if (!input.isAuthenticated) {
    return { type: "redirect_to_sign_in", reason: "unauthenticated" };
  }

  if (!input.role) {
    return { type: "redirect_to_sign_in", reason: "role_config" };
  }

  if (input.role !== input.requiredRole) {
    return {
      type: "redirect_to_role_home",
      to: getRoleHomePath(input.role)
    };
  }

  return { type: "allow" };
}
