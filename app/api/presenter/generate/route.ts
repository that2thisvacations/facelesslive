import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PresenterRequest = {
  script?: string;
  hostId?: string;
  hostName?: string;
  voice?: string;
  productName?: string;
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const providerUrl = process.env.AVATAR_PROVIDER_URL;
  const providerToken = process.env.AVATAR_PROVIDER_TOKEN;

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Presenter services are not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: PresenterRequest;
  try { body = (await request.json()) as PresenterRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const script = body.script?.trim();
  if (!script) return NextResponse.json({ error: "A presenter script is required." }, { status: 400 });
  if (script.length > 6000) return NextResponse.json({ error: "Presenter script is too long." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error: jobError } = await admin.from("presenter_jobs").insert({
    owner_id: authData.user.id,
    host_id: body.hostId?.trim() || "default",
    host_name: body.hostName?.trim() || "AI Presenter",
    voice: body.voice?.trim() || "alloy",
    product_name: body.productName?.trim() || null,
    script,
    status: providerUrl ? "queued" : "needs_provider",
  }).select("id,status,created_at").single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Unable to create presenter job." }, { status: 500 });

  if (!providerUrl) {
    return NextResponse.json({
      job,
      execution: "not_started",
      message: "Presenter package created. Configure AVATAR_PROVIDER_URL to generate avatar video.",
    }, { status: 202 });
  }

  try {
    const providerResponse = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}),
      },
      body: JSON.stringify({
        jobId: job.id,
        script,
        hostId: body.hostId || "default",
        hostName: body.hostName || "AI Presenter",
        voice: body.voice || "alloy",
        productName: body.productName || null,
      }),
      cache: "no-store",
    });

    if (!providerResponse.ok) throw new Error(`Avatar provider returned ${providerResponse.status}.`);
    const providerData = (await providerResponse.json().catch(() => ({}))) as { jobId?: string; mediaUrl?: string; status?: string };
    const nextStatus = providerData.mediaUrl ? "ready" : "generating";

    await admin.from("presenter_jobs").update({
      status: nextStatus,
      provider_job_id: providerData.jobId || null,
      media_url: providerData.mediaUrl || null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("owner_id", authData.user.id);

    return NextResponse.json({
      job: { ...job, status: nextStatus, mediaUrl: providerData.mediaUrl || null },
      execution: "dispatched",
    }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Presenter dispatch failed.";
    await admin.from("presenter_jobs").update({ status: "error", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
