import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type YouTubeMessage = {
  id?: string;
  snippet?: { displayMessage?: string; type?: string };
  authorDetails?: { displayName?: string };
};

type YouTubeBatch = {
  streamJobId?: string;
  externalStreamId?: string;
  items?: YouTubeMessage[];
};

async function resolveStreamJobId(body: YouTubeBatch) {
  if (body.streamJobId?.trim()) return body.streamJobId.trim();
  const external = body.externalStreamId?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!external || !url || !serviceKey) return null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data } = await admin.from("live_stream_mappings")
    .select("stream_job_id")
    .eq("platform", "youtube")
    .eq("external_stream_id", external)
    .maybeSingle();
  return data?.stream_job_id || null;
}

export async function POST(request: Request) {
  const connectorSecret = process.env.LIVE_CONNECTOR_SECRET;
  if (!connectorSecret) return NextResponse.json({ error: "YouTube adapter is not configured." }, { status: 503 });

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== connectorSecret) return NextResponse.json({ error: "Unauthorized adapter." }, { status: 401 });

  let body: YouTubeBatch;
  try { body = (await request.json()) as YouTubeBatch; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const streamJobId = await resolveStreamJobId(body);
  if (!streamJobId) return NextResponse.json({ error: "No active FacelessLive stream mapping was found." }, { status: 404 });

  const origin = new URL(request.url).origin;
  let accepted = 0;
  let ignored = 0;

  for (const item of body.items || []) {
    const message = item.snippet?.displayMessage?.trim();
    if (!message) { ignored += 1; continue; }
    const response = await fetch(`${origin}/api/live/connectors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectorSecret}` },
      body: JSON.stringify({
        platform: "youtube",
        streamJobId,
        eventType: message.endsWith("?") ? "question" : "comment",
        viewerName: item.authorDetails?.displayName || "YouTube viewer",
        message,
        externalEventId: item.id || undefined,
      }),
      cache: "no-store",
    });
    if (response.ok) accepted += 1; else ignored += 1;
  }

  return NextResponse.json({ ok: true, streamJobId, accepted, ignored });
}
