import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticatedOwnerId } from "@/lib/request-owner";
import { findActiveYouTubeBroadcast, getYouTubeAccessToken } from "@/lib/youtube-live";
import { normalizeYouTubeChat, type YouTubeChatItem } from "@/lib/youtube-chat-normalize";

export async function POST(request: Request) {
  let ownerId: string | null;
  try { ownerId = await authenticatedOwnerId(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication unavailable." }, { status: 503 }); }
  if (!ownerId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const connectorSecret = process.env.LIVE_CONNECTOR_SECRET;
  if (!supabaseUrl || !serviceKey || !connectorSecret) return NextResponse.json({ error: "Live ingestion services are not configured." }, { status: 503 });

  try {
    const accessToken = await getYouTubeAccessToken(ownerId);
    const active = await findActiveYouTubeBroadcast(accessToken);
    if (!active) return NextResponse.json({ error: "No active YouTube broadcast with live chat was found." }, { status: 404 });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: mapping, error: mappingError } = await admin.from("live_stream_mappings").select("stream_job_id").eq("owner_id", ownerId).eq("platform", "youtube").eq("external_stream_id", active.broadcastId).maybeSingle();
    if (mappingError) throw mappingError;
    if (!mapping?.stream_job_id) return NextResponse.json({ error: "Map the active YouTube broadcast to a FacelessLive stream job first.", broadcast: active }, { status: 409 });

    const requestUrl = new URL(request.url);
    const chatUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    chatUrl.searchParams.set("part", "id,snippet,authorDetails");
    chatUrl.searchParams.set("liveChatId", active.liveChatId);
    chatUrl.searchParams.set("maxResults", "200");
    const pageToken = requestUrl.searchParams.get("pageToken");
    if (pageToken) chatUrl.searchParams.set("pageToken", pageToken);
    const chatResponse = await fetch(chatUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const chat = await chatResponse.json() as { items?: YouTubeChatItem[]; nextPageToken?: string; pollingIntervalMillis?: number; offlineAt?: string; error?: { message?: string } };
    if (!chatResponse.ok) throw new Error(chat.error?.message || "Unable to read YouTube live chat.");

    const origin = requestUrl.origin;
    let accepted = 0;
    let ignored = 0;
    for (const item of normalizeYouTubeChat(chat.items || [])) {
      const response = await fetch(`${origin}/api/live/connectors`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectorSecret}` }, body: JSON.stringify({ platform: "youtube", streamJobId: mapping.stream_job_id, ...item }), cache: "no-store" });
      if (response.ok) accepted += 1; else ignored += 1;
    }
    return NextResponse.json({ ok: true, broadcast: active, streamJobId: mapping.stream_job_id, accepted, ignored, nextPageToken: chat.nextPageToken || null, pollingIntervalMillis: chat.pollingIntervalMillis || 5000, offlineAt: chat.offlineAt || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube forwarding failed." }, { status: 502 });
  }
}
