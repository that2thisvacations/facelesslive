import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VOICES = new Set(["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"]);

type SpeechQueueRequest = { streamJobId?: string; text?: string; voice?: string };

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;

  if (!url || !anonKey || !serviceKey || !apiKey || !workerUrl) {
    return NextResponse.json({ error: "Live speech queue is not fully configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: SpeechQueueRequest;
  try { body = (await request.json()) as SpeechQueueRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const streamJobId = body.streamJobId?.trim();
  const text = body.text?.trim();
  const voice = VOICES.has(body.voice || "") ? body.voice! : process.env.OPENAI_TTS_VOICE || "alloy";
  if (!streamJobId || !text) return NextResponse.json({ error: "streamJobId and text are required." }, { status: 400 });
  if (text.length > 600) return NextResponse.json({ error: "Live speech text is too long." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error: jobError } = await admin.from("stream_jobs")
    .select("id,status")
    .eq("id", streamJobId)
    .eq("owner_id", authData.user.id)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });
  if (!["starting", "live"].includes(job.status)) return NextResponse.json({ error: "Spoken responses require an active broadcast." }, { status: 409 });

  const speechResponse = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice, input: text, response_format: "mp3" }),
    cache: "no-store",
  });
  if (!speechResponse.ok) return NextResponse.json({ error: `Speech provider returned ${speechResponse.status}.` }, { status: 502 });

  const mp3 = Buffer.from(await speechResponse.arrayBuffer());
  if (mp3.byteLength > 1_500_000) return NextResponse.json({ error: "Generated speech clip is too large for the live queue." }, { status: 413 });

  const base = workerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  const workerResponse = await fetch(`${base}/jobs/${encodeURIComponent(streamJobId)}/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}) },
    body: JSON.stringify({ audioBase64: mp3.toString("base64"), format: "mp3", label: text.slice(0, 100) }),
    cache: "no-store",
  });
  const workerData = await workerResponse.json().catch(() => ({}));
  if (!workerResponse.ok) return NextResponse.json({ error: workerData.error || `Broadcast worker returned ${workerResponse.status}.` }, { status: 502 });

  return NextResponse.json({ ok: true, streamJobId, voice, queue: workerData.queue || null }, { status: 202 });
}
