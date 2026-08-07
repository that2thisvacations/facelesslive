import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptStreamCredentials } from "@/lib/stream-credentials";

type StartRequest = { destinationId?: string; streamDraftId?: string };
type RtmpCredentials = { serverUrl: string; streamKey: string };

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.STREAM_CREDENTIAL_SECRET;
  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;

  if (!url || !anonKey || !serviceKey || !secret) {
    return NextResponse.json({ error: "Broadcast services are not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: StartRequest;
  try { body = (await request.json()) as StartRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  if (!body.destinationId) return NextResponse.json({ error: "A broadcast destination is required." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: destination, error: destinationError } = await admin
    .from("broadcast_destinations")
    .select("id,provider,label,encrypted_credentials,status")
    .eq("id", body.destinationId)
    .eq("owner_id", authData.user.id)
    .maybeSingle();

  if (destinationError) return NextResponse.json({ error: destinationError.message }, { status: 500 });
  if (!destination || destination.status !== "connected" || !destination.encrypted_credentials) {
    return NextResponse.json({ error: "The selected destination is not ready." }, { status: 409 });
  }

  let credentials: RtmpCredentials;
  try { credentials = decryptStreamCredentials<RtmpCredentials>(destination.encrypted_credentials, secret); }
  catch { return NextResponse.json({ error: "Stored stream credentials could not be decrypted." }, { status: 500 }); }

  const { data: job, error: jobError } = await admin.from("stream_jobs").insert({
    owner_id: authData.user.id,
    stream_draft_id: body.streamDraftId || null,
    destination_id: destination.id,
    status: workerUrl ? "queued" : "ready",
  }).select("id,status,created_at").single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Unable to create broadcast job." }, { status: 500 });

  if (!workerUrl) {
    return NextResponse.json({
      job,
      execution: "not_started",
      message: "Broadcast package is ready. Configure BROADCAST_WORKER_URL to execute RTMP streaming.",
    }, { status: 202 });
  }

  try {
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({
        jobId: job.id,
        provider: destination.provider,
        destination: { serverUrl: credentials.serverUrl, streamKey: credentials.streamKey },
      }),
      cache: "no-store",
    });

    if (!workerResponse.ok) throw new Error(`Broadcast worker returned ${workerResponse.status}.`);
    await admin.from("stream_jobs").update({ status: "starting", updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ job: { ...job, status: "starting" }, execution: "dispatched" }, { status: 202 });
  } catch (error) {
    await admin.from("stream_jobs").update({ status: "error", error_message: error instanceof Error ? error.message : "Worker dispatch failed.", updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to dispatch broadcast." }, { status: 502 });
  }
}
