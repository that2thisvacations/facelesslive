import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<any> | null = null;

export function getSupabaseBrowser(): SupabaseClient<any> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient<any>(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
