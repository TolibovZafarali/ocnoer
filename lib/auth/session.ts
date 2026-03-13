import { getRoleFromAppMetadata, type Role } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SessionRoleResult = {
  isAuthenticated: boolean;
  role: Role | null;
};

export async function getSessionRole(): Promise<SessionRoleResult> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return {
      isAuthenticated: false,
      role: null
    };
  }

  return {
    isAuthenticated: true,
    role: getRoleFromAppMetadata(data.user)
  };
}
