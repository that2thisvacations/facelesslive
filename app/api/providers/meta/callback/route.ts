import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { appUrl, encryptProviderTokens, verifyOAuthState } from "@/lib/provider-oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = verifyOAuthState(requestUrl.searchParams.get("state"), "meta");
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const graphVersion = process.env.META_GRAPH_VERSION;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let redirectBase: string;
  try { redirectBase = appUrl(); }
  catch { return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured." }, { status: 503 }); }
  if (!code || !state) return NextResponse.redirect(`${redirectBase}/provider-status?meta=invalid_state`);
  if (!appId || !appSecret || !graphVersion || !supabaseUrl || !serviceKey) return NextResponse.redirect(`${redirectBase}/provider-status?meta=not_configured`);

  try {
    const redirectUri = `${redirectBase}/api/providers/meta/callback`;
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
    const tokenResponse = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`, { cache: "no-store" });
    const tokens = await tokenResponse.json() as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") throw new Error("Meta token exchange failed.");

    const meResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id,name`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    const me = meResponse.ok ? await meResponse.json() as { id?: string; name?: string } : {};
    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : null;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.from("provider_connections").upsert({
      owner_id: state.userId,
      provider: "meta",
      status: "connected",
      provider_account_id: me.id || null,
      provider_account_name: me.name || null,
      encrypted_tokens: encryptProviderTokens(tokens),
      scopes: (process.env.META_OAUTH_SCOPES || "").split(",").map((item) => item.trim()).filter(Boolean),
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,provider" });
    if (error) throw error;
    return NextResponse.redirect(`${redirectBase}/provider-status?meta=connected`);
  } catch {
    return NextResponse.redirect(`${redirectBase}/provider-status?meta=error`);
  }
}
