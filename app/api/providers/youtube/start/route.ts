import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { appUrl, signOAuthState } from "@/lib/provider-oauth";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!url || !anonKey || !clientId) return NextResponse.json({ error: "YouTube OAuth is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  try {
    const redirectUri = `${appUrl()}/api/providers/youtube/callback`;
    const state = signOAuthState(data.user.id, "youtube");
    const scopes = process.env.YOUTUBE_OAUTH_SCOPES || "https://www.googleapis.com/auth/youtube.readonly";
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: scopes, state });
    return NextResponse.json({ authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to begin YouTube connection." }, { status: 503 });
  }
}
