import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type LiveEventRequest = {
  streamJobId?: string;
  eventType?: "comment" | "question" | "reaction";
  viewerName?: string;
  message?: string;
};

function fallbackResponse(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("price") || normalized.includes("cost")) return "The current product price is shown in the live offer. Tap the product card for the latest checkout price.";
  if (normalized.includes("ship")) return "Shipping details can vary by destination. Tap the product card to review the current delivery options before checkout.";
  return "Thanks for the question. Check the product card for the verified details and current offer while the host continues the demonstration.";
}

async function generateResponse(message: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackResponse(message);

  const prompt = [
    "Write one short live-commerce host response to a viewer comment or question.",
    `Viewer message: ${message}`,
    "Keep the response under 45 words.",
    "Do not invent product claims, prices, discounts, inventory, shipping promises, reviews, certifications, or guarantees.",
    "When specific product facts are unavailable, direct the viewer to the product card for verified details.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", input: prompt }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OpenAI returned ${response.status}.`);
    const data = (await response.json()) as { output_text?: string };
    return data.output_text?.trim() || fallbackResponse(message);
  } catch {
    return fallbackResponse(message);
  }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Live commerce services are not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: LiveEventRequest;
  try { body = (await request.json()) as LiveEventRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const streamJobId = body.streamJobId?.trim();
  const message = body.message?.trim();
  const eventType = body.eventType || "comment";
  if (!streamJobId || !message) return NextResponse.json({ error: "streamJobId and message are required." }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: "Live event message is too long." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: streamJob, error: streamError } = await admin.from("stream_jobs")
    .select("id,status")
    .eq("id", streamJobId)
    .eq("owner_id", authData.user.id)
    .maybeSingle();
  if (streamError) return NextResponse.json({ error: streamError.message }, { status: 500 });
  if (!streamJob) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });
  if (!["starting", "live"].includes(streamJob.status)) return NextResponse.json({ error: "Live events require an active broadcast." }, { status: 409 });

  const responseText = eventType === "reaction" ? "Thanks for watching." : await generateResponse(message);
  const { data: event, error: insertError } = await admin.from("live_events").insert({
    owner_id: authData.user.id,
    stream_job_id: streamJob.id,
    source: "manual",
    event_type: eventType,
    viewer_name: body.viewerName?.trim().slice(0, 80) || null,
    message,
    response_text: responseText,
    status: "queued",
  }).select("id,status,created_at").single();
  if (insertError || !event) return NextResponse.json({ error: insertError?.message || "Unable to queue live event." }, { status: 500 });

  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;
  if (!workerUrl) return NextResponse.json({ event, responseText, delivery: "queued" }, { status: 202 });

  const base = workerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  try {
    const workerResponse = await fetch(`${base}/jobs/${encodeURIComponent(streamJob.id)}/overlay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({
        title: body.viewerName?.trim() ? `@${body.viewerName.trim().slice(0, 40)}` : "LIVE VIEWER",
        subtitle: responseText,
        duration: 12,
      }),
      cache: "no-store",
    });
    if (!workerResponse.ok) throw new Error(`Broadcast worker returned ${workerResponse.status}.`);
    await admin.from("live_events").update({ status: "displayed", displayed_at: new Date().toISOString() }).eq("id", event.id).eq("owner_id", authData.user.id);
    return NextResponse.json({ event: { ...event, status: "displayed" }, responseText, delivery: "displayed" }, { status: 202 });
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Unable to update the live overlay.";
    await admin.from("live_events").update({ status: "error", error_message: warning }).eq("id", event.id).eq("owner_id", authData.user.id);
    return NextResponse.json({ event: { ...event, status: "error" }, responseText, delivery: "error", warning }, { status: 202 });
  }
}
