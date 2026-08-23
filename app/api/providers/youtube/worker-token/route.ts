import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getYouTubeAccessToken } from "@/lib/youtube-live";

type RefreshRequest = { jobId?: string };

export async function POST(request: Request) {
  const expected = process.env.BROADCAST_CALLBACK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || !url || !serviceKey) {
    return NextResponse.json({ error: "Worker token refresh is not configured." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized worker token refresh." }, { status: 401 });
  }

  let body: RefreshRequest;
  try { body = (await request.json()) as RefreshRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const jobId = body.jobId?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error: jobError } = await admin.from("stream_jobs")
    .select("id,owner_id,status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });
  if (!["queued", "starting", "live"].includes(job.status)) {
    return NextResponse.json({ error: "Broadcast job is not active." }, { status: 409 });
  }

  try {
    const accessToken = await getYouTubeAccessToken(job.owner_id);
    return NextResponse.json({ ok: true, accessToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh YouTube access token.";
    return NextResponse.json({ error: message, reauthorize: /reconnect|authorization/i.test(message) }, { status: /reconnect|authorization/i.test(message) ? 401 : 502 });
  }
}
