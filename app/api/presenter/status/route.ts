import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ProviderStatus = {
  status?: string;
  mediaUrl?: string;
  error?: string;
};

const READY = new Set(["ready", "completed", "complete", "done", "succeeded", "success"]);
const FAILED = new Set(["error", "failed", "failure", "cancelled", "canceled"]);

function normalizeStatus(value?: string) {
  const status = value?.toLowerCase().trim() || "generating";
  if (READY.has(status)) return "ready";
  if (FAILED.has(status)) return "error";
  return "generating";
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Presenter services are not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Presenter job id is required." }, { status: 400 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error } = await admin
    .from("presenter_jobs")
    .select("id,status,provider_job_id,media_url,error_message,updated_at")
    .eq("id", id)
    .eq("owner_id", authData.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Presenter job not found." }, { status: 404 });

  const statusTemplate = process.env.AVATAR_PROVIDER_STATUS_URL;
  const providerToken = process.env.AVATAR_PROVIDER_TOKEN;
  if (!statusTemplate || !job.provider_job_id || !["queued", "generating"].includes(job.status)) {
    return NextResponse.json({ job });
  }

  try {
    const providerUrl = statusTemplate.includes("{jobId}")
      ? statusTemplate.replace("{jobId}", encodeURIComponent(job.provider_job_id))
      : `${statusTemplate.replace(/\/$/, "")}/${encodeURIComponent(job.provider_job_id)}`;

    const response = await fetch(providerUrl, {
      headers: providerToken ? { Authorization: `Bearer ${providerToken}` } : {},
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Avatar provider status returned ${response.status}.`);

    const provider = (await response.json()) as ProviderStatus;
    const nextStatus = provider.mediaUrl ? "ready" : normalizeStatus(provider.status);
    const updates = {
      status: nextStatus,
      media_url: provider.mediaUrl || job.media_url,
      error_message: nextStatus === "error" ? provider.error || "Avatar generation failed." : null,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("presenter_jobs")
      .update(updates)
      .eq("id", job.id)
      .eq("owner_id", authData.user.id)
      .select("id,status,provider_job_id,media_url,error_message,updated_at")
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ job: updated });
  } catch (pollError) {
    return NextResponse.json({
      job,
      warning: pollError instanceof Error ? pollError.message : "Presenter status refresh failed.",
    });
  }
}
