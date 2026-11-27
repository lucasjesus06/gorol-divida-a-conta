import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

export function createSupabaseAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY precisa estar configurada");
  }
  const { url } = supabaseEnv();
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
