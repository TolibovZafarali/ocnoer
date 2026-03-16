import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv, getSupabaseServerEnv } from "@/lib/supabase/env";

let adminClient: ReturnType<typeof createClient> | null = null;

export function getAdminSupabaseClient() {
  if (!adminClient) {
    const { url } = getSupabaseEnv();
    const { serviceRoleKey } = getSupabaseServerEnv();

    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}
