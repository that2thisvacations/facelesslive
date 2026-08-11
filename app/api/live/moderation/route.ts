import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ActionRequest = { eventId?: string; action?: "approve_speech" | "ignore"; voice?: string };

async function getContext(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Moderation services are not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, token, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

export async function GET(request: Request) {
  let ctx;
  try { ctx = await getContext(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const streamJobId = new URL(request.url).searchParams.get("streamJobId")?.trim();
  let query = ctx.admin.from("live_events")
    .select("id,stream_job_id,source,event_type,viewer_name,message,response_text,status,speech_status,error_message,created_at")
    .eq("owner_id", ctx.user.id)
    .in("speech_status", ["approval_required", "error"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (streamJobId) query = query.eq("stream_job_id", streamJobId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data || [] });
}

export async function POST(request: Request) {
  let ctx;
  try { ctx = await getContext(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: ActionRequest;
  try { body = (await request.json()) as ActionRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body.eventId || !body.action) return NextResponse.json({ error: "eventId and action are required." }, { status: 400 });

  const { data: event, error } = await ctx.admin.from("live_events")
    .select("id,stream_job_id,response_text,speech_status")
    .eq("id", body.eventId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Moderation event not found." }, { status: 404 });

  if (body.action === "ignore") {
    const { error: updateError } = await ctx.admin.from("live_events").update({ status: "ignored", speech_status: "not_requested", updated_at: new Date().toISOString() }).eq("id", event.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  if (!event.response_text?.trim()) return NextResponse.json({ error: "This event has no response text to speak." }, { status: 409 });
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/live/speech/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ streamJobId: event.stream_job_id, text: event.response_text, voice: body.voice || undefined }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: result.error || "Unable to approve spoken response." }, { status: response.status });
  await ctx.admin.from("live_events").update({ speech_status: "queued", response_spoken_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", event.id);
  return NextResponse.json({ ok: true, action: "approve_speech", queue: result.queue || null });
}
