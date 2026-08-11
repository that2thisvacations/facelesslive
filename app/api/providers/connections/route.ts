import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PROVIDERS = new Set(["youtube", "meta"]);

async function context(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Provider connection services are not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

export async function GET(request: Request) {
  let ctx;
  try { ctx = await context(request); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await ctx.admin.from("provider_connections")
    .select("provider,status,provider_account_id,provider_account_name,scopes,expires_at,updated_at")
    .eq("owner_id", ctx.user.id)
    .order("provider");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data || [] });
}

export async function DELETE(request: Request) {
  let ctx;
  try { ctx = await context(request); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider")?.toLowerCase();
  if (!provider || !PROVIDERS.has(provider)) return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  const { error } = await ctx.admin.from("provider_connections").delete().eq("owner_id", ctx.user.id).eq("provider", provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, provider });
}
