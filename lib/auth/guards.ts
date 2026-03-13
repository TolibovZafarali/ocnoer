import { redirect } from "next/navigation";

import { decideRouteAccess } from "@/lib/auth/route-access";
import { getSessionRole } from "@/lib/auth/session";
import { type Role } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ROLE_CONFIG_ERROR_PARAM = "?error=role_config";

export async function requireRole(requiredRole: Role) {
  const session = await getSessionRole();
  const decision = decideRouteAccess({
    requiredRole,
    isAuthenticated: session.isAuthenticated,
    role: session.role
  });

  if (decision.type === "allow") {
    return;
  }

  if (decision.type === "redirect_to_role_home") {
    redirect(decision.to);
  }

  if (decision.reason === "role_config") {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    redirect(`/sign-in${ROLE_CONFIG_ERROR_PARAM}`);
  }

  redirect("/sign-in");
}
