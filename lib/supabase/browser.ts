import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabaseClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseEnv();

    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
