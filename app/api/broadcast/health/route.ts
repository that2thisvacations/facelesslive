import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const HEALTHY_INGESTION = new Set(["starting", "healthy", "refreshing_token"]);
const DEGRADED_INGESTION = new Set(["retrying", "rate_limited", "provider_error", "token_refresh_error"]);

type WorkerYouTubeState = {
  status?: string;
  pageToken?: string | null;
  providerDelay?: number;
  reconnects?: number;
  received?: number;
  authRefreshes?: number;
  error?: string;
  updatedAt?: string;
};

type WorkerJob = {
  status?: string;
  error?: string | null;
  updatedAt?: string;
  youtube?: WorkerYouTubeState | null;
};

function ingestionState(youtube?: WorkerYouTubeState | null) {
  if (!youtube) return "not_applicable";
  const status = youtube.status || "unknown";
  if (HEALTHY_INGESTION.has(status)) return "healthy";
  if (DEGRADED_INGESTION.has(status)) return "degraded";
  if (status === "reauthorize") return "reauthorization_required";
  if (["ended", "disabled", "stopped"].includes(status)) return status;
  if (status === "error") return "error";
  return "unknown";
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workerUrl = process.env.BROADCAST_WORKER_URL;
  const workerToken = process.env.BROADCAST_WORKER_TOKEN;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Broadcast services are not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const requestUrl = new URL(request.url);
  const jobId = requestUrl.searchParams.get("id")?.trim();
  if (!jobId) return NextResponse.json({ error: "A broadcast job id is required." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: job, error: jobError } = await admin.from("stream_jobs")
    .select("id,status,error_message,updated_at,destination_id")
    .eq("id", jobId)
    .eq("owner_id", authData.user.id)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Broadcast job not found." }, { status: 404 });

  const baseResponse = {
    job: {
      id: job.id,
      status: job.status,
      errorMessage: job.error_message,
      updatedAt: job.updated_at,
    },
  };

  if (!workerUrl) {
    return NextResponse.json({
      ...baseResponse,
      worker: { reachable: false, configured: false },
      ingestion: { state: "unavailable", status: null },
    });
  }

  const base = workerUrl.replace(/\/broadcast\/?$/, "").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/jobs/${encodeURIComponent(job.id)}`, {
      headers: workerToken ? { Authorization: `Bearer ${workerToken}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({
        ...baseResponse,
        worker: { reachable: true, configured: true, status: response.status },
        ingestion: { state: response.status === 404 ? "worker_job_missing" : "unavailable", status: null },
      });
    }

    const body = await response.json().catch(() => ({})) as { job?: WorkerJob };
    const workerJob = body.job || {};
    const youtube = workerJob.youtube || null;
    const updatedAt = youtube?.updatedAt || workerJob.updatedAt || null;
    const ageMs = updatedAt ? Math.max(0, Date.now() - new Date(updatedAt).getTime()) : null;
    const state = ingestionState(youtube);

    return NextResponse.json({
      ...baseResponse,
      worker: {
        reachable: true,
        configured: true,
        status: workerJob.status || null,
        error: workerJob.error || null,
        updatedAt: workerJob.updatedAt || null,
      },
      ingestion: {
        state,
        status: youtube?.status || null,
        pageTokenPresent: Boolean(youtube?.pageToken),
        pollingIntervalMillis: youtube?.providerDelay || null,
        reconnects: youtube?.reconnects || 0,
        authRefreshes: youtube?.authRefreshes || 0,
        lastBatchSize: youtube?.received ?? null,
        error: youtube?.error || null,
        updatedAt,
        stale: ageMs !== null ? ageMs > 45000 : null,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ...baseResponse,
      worker: { reachable: false, configured: true },
      ingestion: {
        state: "unavailable",
        status: null,
        error: error instanceof Error ? error.message : "Unable to reach broadcast worker.",
      },
    });
  }
}
