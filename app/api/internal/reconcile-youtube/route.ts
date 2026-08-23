import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkerJob = {
  status?: string;
  updatedAt?: string;
  youtube?: {
    status?: string;
    externalStreamId?: string;
    liveChatId?: string;
    reconnects?: number;
    providerDelay?: number;
    received?: number;
    error?: string;
    updatedAt?: string;
  } | null;
};

const ACTIVE_STREAM_STATUSES = ["queued", "starting", "live"];
const TERMINAL_YOUTUBE_STATUSES = new Set(["ended"]);
const MAX_JOBS_PER_RUN = 20;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function sanitizeHealth(job: WorkerJob) {
  const youtube = job.youtube;
  if (!youtube) return null;
  return {
    provider: "youtube",
    status: String(youtube.status || "unknown").slice(0, 40),
    reconnects: Math.max(0, Number(youtube.reconnects || 0)),
    polling_interval_ms: Math.max(0, Number(youtube.providerDelay || 0)),
    last_batch_size: Math.max(0, Number(youtube.received || 0)),
    external_stream_id: youtube.externalStreamId ? String(youtube.externalStreamId).slice(0, 180) : null,
    error: youtube.error ? String(youtube.error).slice(0, 500) : null,
    updated_at: youtube.updatedAt || job.updatedAt || new Date().toISOString(),
    checked_at: new Date().toISOString(),
  };
}

async function workerFetch(path: string, init: RequestInit = {}) {
  const configuredWorkerUrl = process.env.BROADCAST_WORKER_URL || "";
  const workerBase = configuredWorkerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;
  if (!workerBase) throw new Error("BROADCAST_WORKER_URL is not configured.");

  return fetch(`${workerBase}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
}

async function reconcile() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing.");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: jobs, error } = await admin
    .from("stream_jobs")
    .select("id,status,destination_id,ingestion_health,broadcast_destinations!inner(provider)")
    .in("status", ACTIVE_STREAM_STATUSES)
    .eq("broadcast_destinations.provider", "youtube")
    .order("updated_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (error) throw error;

  const summary = { checked: 0, updated: 0, ended: 0, unavailable: 0 };

  await Promise.all((jobs || []).map(async (row) => {
    summary.checked += 1;
    const previousHealth = row.ingestion_health && typeof row.ingestion_health === "object"
      ? row.ingestion_health
      : {};

    try {
      const response = await workerFetch(`/jobs/${encodeURIComponent(row.id)}`);
      if (response.status === 404) {
        summary.unavailable += 1;
        const message = "Broadcast worker no longer has this active stream job.";
        await admin.from("stream_jobs").update({
          status: "error",
          error_message: message,
          ingestion_health: {
            ...previousHealth,
            provider: "youtube",
            status: "worker_job_missing",
            error: message,
            checked_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        return;
      }
      if (!response.ok) throw new Error(`Worker health returned ${response.status}.`);

      const body = await response.json() as { job?: WorkerJob };
      const health = sanitizeHealth(body.job || {});
      if (health) {
        const { error: updateError } = await admin.from("stream_jobs").update({
          ingestion_health: health,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (updateError) throw updateError;
        summary.updated += 1;
      }

      if (health && TERMINAL_YOUTUBE_STATUSES.has(health.status) && ACTIVE_STREAM_STATUSES.includes(row.status)) {
        const stopResponse = await workerFetch(`/jobs/${encodeURIComponent(row.id)}/stop`, { method: "POST" });
        if (!stopResponse.ok && stopResponse.status !== 404) {
          throw new Error(`Worker stop returned ${stopResponse.status}.`);
        }

        const { error: endedError } = await admin.from("stream_jobs").update({
          status: "ended",
          error_message: null,
          ingestion_health: health,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (endedError) throw endedError;
        summary.ended += 1;
      }
    } catch (jobError) {
      summary.unavailable += 1;
      await admin.from("stream_jobs").update({
        ingestion_health: {
          ...previousHealth,
          provider: "youtube",
          status: "health_check_error",
          error: jobError instanceof Error ? jobError.message.slice(0, 500) : "Unable to reconcile YouTube ingestion health.",
          checked_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }));

  return summary;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized reconciler request." }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await reconcile()) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "YouTube reconciliation failed.",
    }, { status: 500 });
  }
}
