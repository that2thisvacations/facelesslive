import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptStreamCredentials } from "@/lib/stream-credentials";
import { findActiveYouTubeBroadcast, getYouTubeAccessToken } from "@/lib/youtube-live";

type Scene = { id?: string; start?: number; end?: number; title?: string; subtitle?: string; position?: string };
type ScenePlan = { version?: number; layout?: string; scenes?: Scene[] };
type StartRequest = { destinationId?: string; streamDraftId?: string; presenterJobId?: string; scenePlan?: ScenePlan; productImageUrl?: string };
type RtmpCredentials = { serverUrl: string; streamKey: string };

function sanitizeScenePlan(plan?: ScenePlan): ScenePlan | null {
  if (!plan?.scenes?.length) return null;
  const scenes = plan.scenes.slice(0, 8).map((scene, index) => ({
    id: String(scene.id || `scene-${index + 1}`).slice(0, 40),
    start: Math.max(0, Number(scene.start || 0)),
    end: Math.max(0, Number(scene.end || 0)),
    title: String(scene.title || "").slice(0, 120),
    subtitle: String(scene.subtitle || "").slice(0, 160),
    position: scene.position === "top" ? "top" : "lower-third",
  })).filter((scene) => scene.end > scene.start && (scene.title || scene.subtitle));
  return scenes.length ? { version: 1, layout: String(plan.layout || "Host + Product").slice(0, 60), scenes } : null;
}

function sanitizeProductImageUrl(value?: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['https:'].includes(url.protocol)) return null;
    return url.toString().slice(0, 1200);
  } catch { return null; }
}

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
  const scenePlan = sanitizeScenePlan(body.scenePlan);
  const productImageUrl = sanitizeProductImageUrl(body.productImageUrl);

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

  let presenter: { id: string; media_url: string | null; status: string } | null = null;
  if (body.presenterJobId) {
    const { data, error } = await admin.from("presenter_jobs")
      .select("id,media_url,status")
      .eq("id", body.presenterJobId)
      .eq("owner_id", authData.user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.status !== "ready" || !data.media_url) {
      return NextResponse.json({ error: "The selected AI presenter is not ready for broadcast." }, { status: 409 });
    }
    presenter = data;
  }

  let credentials: RtmpCredentials;
  try { credentials = decryptStreamCredentials<RtmpCredentials>(destination.encrypted_credentials, secret); }
  catch { return NextResponse.json({ error: "Stored stream credentials could not be decrypted." }, { status: 500 }); }

  const { data: job, error: jobError } = await admin.from("stream_jobs").insert({
    owner_id: authData.user.id,
    stream_draft_id: body.streamDraftId || null,
    destination_id: destination.id,
    presenter_job_id: presenter?.id || null,
    status: workerUrl ? "queued" : "ready",
  }).select("id,status,created_at").single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Unable to create broadcast job." }, { status: 500 });

  if (!workerUrl) {
    return NextResponse.json({
      job,
      execution: "not_started",
      scenePlan,
      productImageUrl,
      message: "Broadcast package is ready. Configure BROADCAST_WORKER_URL to execute RTMP streaming.",
    }, { status: 202 });
  }

  let youtube: { externalStreamId: string; liveChatId: string; accessToken: string } | null = null;
  if (String(destination.provider || "").toLowerCase() === "youtube") {
    try {
      const accessToken = await getYouTubeAccessToken(authData.user.id);
      const active = await findActiveYouTubeBroadcast(accessToken);
      if (!active) {
        await admin.from("stream_jobs").update({ status: "error", error_message: "No active YouTube broadcast with live chat was found.", updated_at: new Date().toISOString() }).eq("id", job.id);
        return NextResponse.json({ error: "No active YouTube broadcast with live chat was found." }, { status: 409 });
      }

      const { data: claimed, error: claimError } = await admin.rpc("claim_live_stream_mapping", {
        p_owner_id: authData.user.id,
        p_platform: "youtube",
        p_external_stream_id: active.broadcastId,
        p_stream_job_id: job.id,
      });
      if (claimError) throw claimError;
      if (claimed !== true) {
        const message = "The active YouTube broadcast is already mapped to another active stream job.";
        await admin.from("stream_jobs").update({ status: "error", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id);
        return NextResponse.json({ error: message }, { status: 409 });
      }

      youtube = { externalStreamId: active.broadcastId, liveChatId: active.liveChatId, accessToken };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare YouTube live ingestion.";
      await admin.from("stream_jobs").update({ status: "error", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id);
      return NextResponse.json({ error: message }, { status: /reconnect|authorization/i.test(message) ? 401 : 502 });
    }
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
        presenter: presenter ? { jobId: presenter.id, mediaUrl: presenter.media_url } : null,
        scenePlan,
        product: productImageUrl ? { imageUrl: productImageUrl } : null,
        youtube,
      }),
      cache: "no-store",
    });

    if (!workerResponse.ok) throw new Error(`Broadcast worker returned ${workerResponse.status}.`);
    await admin.from("stream_jobs").update({ status: "starting", updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ job: { ...job, status: "starting" }, execution: "dispatched", scenePlan, productImageUrl, youtubeIngestion: Boolean(youtube) }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dispatch broadcast.";
    await admin.from("stream_jobs").update({ status: "error", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
