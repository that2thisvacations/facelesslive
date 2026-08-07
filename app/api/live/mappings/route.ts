import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PLATFORMS = new Set(["tiktok", "youtube", "facebook", "instagram", "custom"]);

type MappingRequest = {
  platform?: string;
  externalStreamId?: string;
  streamJobId?: string;
};

async function getContext(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Live mapping services are not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

export async function GET(request: Request) {
  let context;
  try { context = await getContext(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await context.admin.from("live_stream_mappings")
    .select("id,platform,external_stream_id,stream_job_id,created_at,updated_at")
    .eq("owner_id", context.user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mappings: data || [] });
}

export async function POST(request: Request) {
  let context;
  try { context = await getContext(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: MappingRequest;
  try { body = (await request.json()) as MappingRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const platform = body.platform?.trim().toLowerCase();
  const externalStreamId = body.externalStreamId?.trim().slice(0, 200);
  const streamJobId = body.streamJobId?.trim();
  if (!platform || !PLATFORMS.has(platform)) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });
  if (!externalStreamId || !streamJobId) return NextResponse.json({ error: "externalStreamId and streamJobId are required." }, { status: 400 });

  const { data: job, error: jobError } = await context.admin.from("stream_jobs")
    .select("id,status")
    .eq("id", streamJobId)
    .eq("owner_id", context.user.id)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });

  const { data, error } = await context.admin.from("live_stream_mappings").upsert({
    owner_id: context.user.id,
    platform,
    external_stream_id: externalStreamId,
    stream_job_id: job.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id,platform,external_stream_id" }).select("id,platform,external_stream_id,stream_job_id,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mapping: data }, { status: 200 });
}

export async function DELETE(request: Request) {
  let context;
  try { context = await getContext(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 }); }
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Mapping id is required." }, { status: 400 });
  const { error } = await context.admin.from("live_stream_mappings").delete().eq("id", id).eq("owner_id", context.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
