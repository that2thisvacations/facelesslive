import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { appUrl, encryptProviderTokens, verifyOAuthState } from "@/lib/provider-oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = verifyOAuthState(requestUrl.searchParams.get("state"), "youtube");
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let redirectBase: string;
  try { redirectBase = appUrl(); }
  catch { return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured." }, { status: 503 }); }
  if (!code || !state) return NextResponse.redirect(`${redirectBase}/provider-status?youtube=invalid_state`);
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) return NextResponse.redirect(`${redirectBase}/provider-status?youtube=not_configured`);

  try {
    const redirectUri = `${redirectBase}/api/providers/youtube/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
    });
    const tokens = await tokenResponse.json() as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") throw new Error("YouTube token exchange failed.");

    let channelId: string | null = null;
    let channelTitle: string | null = null;
    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    if (channelResponse.ok) {
      const channelData = await channelResponse.json() as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      channelId = channelData.items?.[0]?.id || null;
      channelTitle = channelData.items?.[0]?.snippet?.title || null;
    }

    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.from("provider_connections").upsert({
      owner_id: state.userId,
      provider: "youtube",
      status: "connected",
      provider_account_id: channelId,
      provider_account_name: channelTitle,
      encrypted_tokens: encryptProviderTokens(tokens),
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : [],
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,provider" });
    if (error) throw error;
    return NextResponse.redirect(`${redirectBase}/provider-status?youtube=connected`);
  } catch {
    return NextResponse.redirect(`${redirectBase}/provider-status?youtube=error`);
  }
}
