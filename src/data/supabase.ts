import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config.js";

export type AdminSupabaseClient = SupabaseClient<any, any, any>;

export function createUserSupabaseClient(accessToken: string): AdminSupabaseClient {
  const config = getConfig();
  return createClient(config.supabaseUrl.toString(), config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
