import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);
const WORKER_TOKEN = process.env.BROADCAST_WORKER_TOKEN || "";
const APP_URL = (process.env.FACELESSLIVE_APP_URL || "").replace(/\/$/, "");
const CALLBACK_SECRET = process.env.BROADCAST_CALLBACK_SECRET || "";
const jobs = new Map();

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large.");
  }
  return JSON.parse(body || "{}");
}

function authorized(req) {
  if (!WORKER_TOKEN) return true;
  return req.headers.authorization === `Bearer ${WORKER_TOKEN}`;
}

async function report(jobId, status, error) {
  const current = jobs.get(jobId) || {};
  jobs.set(jobId, { ...current, status, error: error || null, updatedAt: new Date().toISOString() });
  if (!APP_URL || !CALLBACK_SECRET) return;
  try {
    await fetch(`${APP_URL}/api/broadcast/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CALLBACK_SECRET}`,
      },
      body: JSON.stringify({ jobId, status, error: error || undefined }),
    });
  } catch (callbackError) {
    console.error("callback_failed", jobId, callbackError);
  }
}

function buildOutputUrl(serverUrl, streamKey) {
  return `${serverUrl.replace(/\/$/, "")}/${streamKey.replace(/^\//, "")}`;
}

async function startJob(payload) {
  const { jobId, destination, presenter } = payload || {};
  if (!jobId || !destination?.serverUrl || !destination?.streamKey) {
    throw new Error("jobId and RTMP destination credentials are required.");
  }
  if (!presenter?.mediaUrl) {
    throw new Error("A ready presenter mediaUrl is required for this worker.");
  }
  if (jobs.get(jobId)?.process) throw new Error("Broadcast job is already running.");

  const output = buildOutputUrl(destination.serverUrl, destination.streamKey);
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-stream_loop", "-1",
    "-i", presenter.mediaUrl,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-g", "60",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-f", "flv",
    output,
  ];

  await report(jobId, "starting");
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  jobs.set(jobId, { process: child, status: "starting", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  let liveReported = false;
  child.stderr.on("data", async (chunk) => {
    const line = String(chunk);
    console.log(`[${jobId}] ${line.trim()}`);
    if (!liveReported && /frame=|time=/.test(line)) {
      liveReported = true;
      await report(jobId, "live");
    }
  });

  child.on("error", async (error) => {
    await report(jobId, "error", error.message);
  });

  child.on("exit", async (code, signal) => {
    const current = jobs.get(jobId) || {};
    jobs.set(jobId, { ...current, process: null, exitCode: code, signal });
    if (code === 0 || signal === "SIGTERM") await report(jobId, "ended");
    else await report(jobId, "error", `FFmpeg exited with code ${code ?? "unknown"}.`);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "facelesslive-broadcast-worker", activeJobs: [...jobs.values()].filter((job) => job.process).length });
  }

  if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length));
    const job = jobs.get(id);
    if (!job) return json(res, 404, { error: "Job not found." });
    const { process: _process, ...safe } = job;
    return json(res, 200, { job: safe });
  }

  if (req.method === "POST" && url.pathname === "/broadcast") {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    try {
      const payload = await readJson(req);
      await startJob(payload);
      return json(res, 202, { ok: true, jobId: payload.jobId, status: "starting" });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Unable to start broadcast." });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/jobs/") && url.pathname.endsWith("/stop")) {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length, -"/stop".length));
    const job = jobs.get(id);
    if (!job?.process) return json(res, 404, { error: "Active job not found." });
    job.process.kill("SIGTERM");
    return json(res, 202, { ok: true, jobId: id, status: "stopping" });
  }

  return json(res, 404, { error: "Not found." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FacelessLive broadcast worker listening on ${PORT}`);
});
