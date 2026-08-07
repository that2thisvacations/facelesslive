import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ConnectorEvent = {
  platform?: "tiktok" | "youtube" | "facebook" | "instagram" | "custom";
  streamJobId?: string;
  eventType?: "comment" | "question" | "reaction";
  viewerName?: string;
  message?: string;
  externalEventId?: string;
};

const ALLOWED_PLATFORMS = new Set(["tiktok", "youtube", "facebook", "instagram", "custom"]);
const ALLOWED_TYPES = new Set(["comment", "question", "reaction"]);

function fallbackResponse(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("price") || normalized.includes("cost")) return "The current price is shown in the product card. Tap it for the latest checkout price.";
  if (normalized.includes("ship")) return "Shipping varies by destination. Open the product card for current delivery details.";
  return "Thanks for the question. Check the product card for verified details while the host continues the demo.";
}

async function generateResponse(message: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackResponse(message);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          "Write one concise live-commerce response under 45 words.",
          `Viewer message: ${message}`,
          "Do not invent prices, discounts, inventory, shipping promises, product claims, certifications, reviews, or guarantees.",
          "When facts are unavailable, direct the viewer to the product card for verified details.",
        ].join("\n"),
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("response generation failed");
    const data = (await response.json()) as { output_text?: string };
    return data.output_text?.trim() || fallbackResponse(message);
  } catch {
    return fallbackResponse(message);
  }
}

export async function POST(request: Request) {
  const secret = process.env.LIVE_CONNECTOR_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !serviceKey) return NextResponse.json({ error: "Live connector service is not configured." }, { status: 503 });

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== secret) return NextResponse.json({ error: "Unauthorized connector." }, { status: 401 });

  let body: ConnectorEvent;
  try { body = (await request.json()) as ConnectorEvent; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const platform = body.platform?.toLowerCase();
  const eventType = body.eventType || "comment";
  const streamJobId = body.streamJobId?.trim();
  const message = body.message?.trim();
  if (!platform || !ALLOWED_PLATFORMS.has(platform)) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });
  if (!ALLOWED_TYPES.has(eventType)) return NextResponse.json({ error: "Unsupported event type." }, { status: 400 });
  if (!streamJobId || !message) return NextResponse.json({ error: "streamJobId and message are required." }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: "Event message is too long." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: streamJob, error: streamError } = await admin.from("stream_jobs")
    .select("id,owner_id,status")
    .eq("id", streamJobId)
    .maybeSingle();
  if (streamError) return NextResponse.json({ error: streamError.message }, { status: 500 });
  if (!streamJob) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });
  if (!["starting", "live"].includes(streamJob.status)) return NextResponse.json({ error: "Connector events require an active broadcast." }, { status: 409 });

  if (body.externalEventId) {
    const { data: duplicate } = await admin.from("live_events")
      .select("id")
      .eq("stream_job_id", streamJob.id)
      .eq("external_event_id", body.externalEventId.slice(0, 160))
      .maybeSingle();
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true, eventId: duplicate.id });
  }

  const responseText = eventType === "reaction" ? "Thanks for watching." : await generateResponse(message);
  const { data: event, error: insertError } = await admin.from("live_events").insert({
    owner_id: streamJob.owner_id,
    stream_job_id: streamJob.id,
    source: platform,
    external_event_id: body.externalEventId?.slice(0, 160) || null,
    event_type: eventType,
    viewer_name: body.viewerName?.trim().slice(0, 80) || null,
    message,
    response_text: responseText,
    status: "queued",
  }).select("id,status,created_at").single();
  if (insertError || !event) return NextResponse.json({ error: insertError?.message || "Unable to queue connector event." }, { status: 500 });

  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;
  if (!workerUrl) return NextResponse.json({ event, responseText, delivery: "queued" }, { status: 202 });

  const base = workerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  try {
    const workerResponse = await fetch(`${base}/jobs/${encodeURIComponent(streamJob.id)}/overlay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}) },
      body: JSON.stringify({
        title: body.viewerName?.trim() ? `@${body.viewerName.trim().slice(0, 40)}` : platform.toUpperCase(),
        subtitle: responseText,
        duration: 12,
      }),
      cache: "no-store",
    });
    if (!workerResponse.ok) throw new Error(`Broadcast worker returned ${workerResponse.status}.`);
    await admin.from("live_events").update({ status: "displayed", displayed_at: new Date().toISOString() }).eq("id", event.id);
    return NextResponse.json({ event: { ...event, status: "displayed" }, responseText, delivery: "displayed" }, { status: 202 });
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Unable to update live overlay.";
    await admin.from("live_events").update({ status: "error", error_message: warning }).eq("id", event.id);
    return NextResponse.json({ event: { ...event, status: "error" }, responseText, delivery: "error", warning }, { status: 202 });
  }
}
