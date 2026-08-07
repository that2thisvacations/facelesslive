import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type StopRequest = { jobId?: string };

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;
  if (!url || !anonKey || !serviceKey || !workerUrl) {
    return NextResponse.json({ error: "Broadcast services are not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: StopRequest;
  try { body = (await request.json()) as StopRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body.jobId) return NextResponse.json({ error: "A broadcast job id is required." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error } = await admin.from("stream_jobs")
    .select("id,status")
    .eq("id", body.jobId)
    .eq("owner_id", authData.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });

  const base = workerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  const response = await fetch(`${base}/jobs/${encodeURIComponent(job.id)}/stop`, {
    method: "POST",
    headers: workerToken ? { Authorization: `Bearer ${workerToken}` } : {},
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    return NextResponse.json({ error: detail.error || `Broadcast worker returned ${response.status}.` }, { status: 502 });
  }

  await admin.from("stream_jobs").update({ status: "ended", updated_at: new Date().toISOString() }).eq("id", job.id);
  return NextResponse.json({ ok: true, jobId: job.id, status: "ended" });
}
