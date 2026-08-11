import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { appUrl, signOAuthState } from "@/lib/provider-oauth";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appId = process.env.META_APP_ID;
  const graphVersion = process.env.META_GRAPH_VERSION;
  if (!url || !anonKey || !appId || !graphVersion) return NextResponse.json({ error: "Meta OAuth is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  try {
    const redirectUri = `${appUrl()}/api/providers/meta/callback`;
    const state = signOAuthState(data.user.id, "meta");
    const scopes = process.env.META_OAUTH_SCOPES || "pages_show_list,pages_read_engagement,pages_manage_metadata";
    const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope: scopes, state });
    return NextResponse.json({ authorizeUrl: `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to begin Meta connection." }, { status: 503 });
  }
}
