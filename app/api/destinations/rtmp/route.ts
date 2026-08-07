import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { encryptStreamCredentials } from "@/lib/stream-credentials";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.STREAM_CREDENTIAL_SECRET;
  if (!url || !anonKey || !serviceKey || !secret) {
    return NextResponse.json({ error: "Secure RTMP storage is not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid RTMP configuration." }, { status: 400 });
  const data = body as { label?: string; serverUrl?: string; streamKey?: string };
  if (!data.serverUrl || !/^rtmps?:\/\//i.test(data.serverUrl) || !data.streamKey || data.streamKey.length < 6) {
    return NextResponse.json({ error: "A valid RTMP server URL and stream key are required." }, { status: 400 });
  }

  const encrypted = encryptStreamCredentials({ serverUrl: data.serverUrl, streamKey: data.streamKey }, secret);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("broadcast_destinations").insert({
    owner_id: authData.user.id,
    provider: "custom-rtmp",
    label: data.label?.trim() || "Custom RTMP",
    encrypted_credentials: encrypted,
    status: "connected",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
