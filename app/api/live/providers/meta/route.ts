import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type MetaComment = { id?: string; message?: string; from?: { name?: string } };
type MetaChange = {
  field?: string;
  value?: {
    item?: string;
    verb?: string;
    comment_id?: string;
    message?: string;
    from?: { name?: string };
    comment?: MetaComment;
    stream_job_id?: string;
    live_video_id?: string;
    video_id?: string;
  };
};
type MetaWebhook = { entry?: Array<{ id?: string; changes?: MetaChange[] }> };

function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function resolveMappedJob(externalStreamId: string | undefined) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!externalStreamId || !url || !serviceKey) return null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data } = await admin.from("live_stream_mappings")
    .select("stream_job_id,platform")
    .in("platform", ["facebook", "instagram"])
    .eq("external_stream_id", externalStreamId)
    .maybeSingle();
  return data?.stream_job_id || null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const connectorSecret = process.env.LIVE_CONNECTOR_SECRET;
  if (!appSecret || !connectorSecret) return NextResponse.json({ error: "Meta live adapter is not configured." }, { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid Meta signature." }, { status: 401 });
  }

  let body: MetaWebhook;
  try { body = JSON.parse(raw) as MetaWebhook; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const origin = new URL(request.url).origin;
  let accepted = 0;
  let ignored = 0;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const comment = value.comment;
      const message = (comment?.message || value.message || "").trim();
      const externalStreamId = value.live_video_id?.trim() || value.video_id?.trim() || entry.id?.trim();
      const streamJobId = value.stream_job_id?.trim() || await resolveMappedJob(externalStreamId);
      if (!message || !streamJobId) { ignored += 1; continue; }

      const response = await fetch(`${origin}/api/live/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectorSecret}` },
        body: JSON.stringify({
          platform: "facebook",
          streamJobId,
          eventType: message.endsWith("?") ? "question" : "comment",
          viewerName: comment?.from?.name || value.from?.name || "Meta viewer",
          message,
          externalEventId: comment?.id || value.comment_id || undefined,
        }),
        cache: "no-store",
      });
      if (response.ok) accepted += 1; else ignored += 1;
    }
  }

  return NextResponse.json({ ok: true, accepted, ignored });
}
