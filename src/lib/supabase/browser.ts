import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Only for sending a file with a one-time permission the server signed; it never holds a session. */
export function createSupabaseUploadClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
