import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MODES = new Set(["manual", "safe_auto"]);
const VOICES = new Set(["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"]);

type PolicyRequest = {
  streamJobId?: string;
  mode?: string;
  voice?: string;
  maxSpokenPerMinute?: number;
  speakReactions?: boolean;
};

async function context(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Live response policy services are not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

export async function GET(request: Request) {
  let ctx;
  try { ctx = await context(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const streamJobId = new URL(request.url).searchParams.get("streamJobId")?.trim();
  if (!streamJobId) return NextResponse.json({ error: "streamJobId is required." }, { status: 400 });
  const { data: job } = await ctx.admin.from("stream_jobs").select("id").eq("id", streamJobId).eq("owner_id", ctx.user.id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });

  const { data, error } = await ctx.admin.from("live_response_policies").select("mode,voice,max_spoken_per_minute,speak_reactions,updated_at").eq("stream_job_id", streamJobId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data || { mode: "manual", voice: "alloy", max_spoken_per_minute: 4, speak_reactions: false } });
}

export async function POST(request: Request) {
  let ctx;
  try { ctx = await context(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: PolicyRequest;
  try { body = (await request.json()) as PolicyRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const streamJobId = body.streamJobId?.trim();
  const mode = body.mode?.trim() || "manual";
  const voice = VOICES.has(body.voice || "") ? body.voice! : "alloy";
  const max = Math.min(10, Math.max(1, Number(body.maxSpokenPerMinute || 4)));
  if (!streamJobId) return NextResponse.json({ error: "streamJobId is required." }, { status: 400 });
  if (!MODES.has(mode)) return NextResponse.json({ error: "Unsupported response mode." }, { status: 400 });

  const { data: job } = await ctx.admin.from("stream_jobs").select("id").eq("id", streamJobId).eq("owner_id", ctx.user.id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });

  const { data, error } = await ctx.admin.from("live_response_policies").upsert({
    owner_id: ctx.user.id,
    stream_job_id: streamJobId,
    mode,
    voice,
    max_spoken_per_minute: max,
    speak_reactions: Boolean(body.speakReactions),
    updated_at: new Date().toISOString(),
  }, { onConflict: "stream_job_id" }).select("mode,voice,max_spoken_per_minute,speak_reactions,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data });
}
