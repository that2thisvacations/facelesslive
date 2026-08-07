import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8080);
const WORKER_TOKEN = process.env.BROADCAST_WORKER_TOKEN || "";
const APP_URL = (process.env.FACELESSLIVE_APP_URL || "").replace(/\/$/, "");
const CALLBACK_SECRET = process.env.BROADCAST_CALLBACK_SECRET || "";
const jobs = new Map();
const PCM_RATE = 44100;
const PCM_CHANNELS = 2;
const PCM_BYTES = 2;
const FRAME_MS = 20;
const FRAME_BYTES = Math.round(PCM_RATE * PCM_CHANNELS * PCM_BYTES * FRAME_MS / 1000);
const SILENCE_FRAME = Buffer.alloc(FRAME_BYTES);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 3_000_000) throw new Error("Request body too large.");
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CALLBACK_SECRET}` },
      body: JSON.stringify({ jobId, status, error: error || undefined }),
    });
  } catch (callbackError) {
    console.error("callback_failed", jobId, callbackError);
  }
}

function buildOutputUrl(serverUrl, streamKey) {
  return `${serverUrl.replace(/\/$/, "")}/${streamKey.replace(/^\//, "")}`;
}

function normalizeScenes(scenePlan) {
  if (!scenePlan?.scenes?.length) return [];
  return scenePlan.scenes.slice(0, 8).map((scene, index) => ({
    id: String(scene.id || `scene-${index + 1}`),
    start: Math.max(0, Number(scene.start || 0)),
    end: Math.max(0, Number(scene.end || 0)),
    title: String(scene.title || "").slice(0, 120),
    subtitle: String(scene.subtitle || "").slice(0, 160),
    position: scene.position === "top" ? "top" : "lower-third",
  })).filter((scene) => scene.end > scene.start && (scene.title || scene.subtitle));
}

function cleanOverlayText(value, max = 180) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function buildSceneFilters(jobId, scenePlan) {
  const scenes = normalizeScenes(scenePlan);
  const tempDir = mkdtempSync(join(tmpdir(), `facelesslive-${jobId}-`));
  const filters = [];

  scenes.forEach((scene, index) => {
    const titleFile = join(tempDir, `scene-${index}-title.txt`);
    const subtitleFile = join(tempDir, `scene-${index}-subtitle.txt`);
    writeFileSync(titleFile, scene.title, "utf8");
    writeFileSync(subtitleFile, scene.subtitle, "utf8");
    const enable = `between(t,${scene.start},${scene.end})`;
    const boxY = scene.position === "top" ? "30" : "h-190";
    const titleY = scene.position === "top" ? "65" : "h-145";
    const subtitleY = scene.position === "top" ? "118" : "h-92";
    filters.push(`drawbox=x=32:y=${boxY}:w=w-64:h=150:color=black@0.68:t=fill:enable='${enable}'`);
    filters.push(`drawtext=textfile='${titleFile}':fontcolor=white:fontsize=42:x=60:y=${titleY}:enable='${enable}'`);
    if (scene.subtitle) filters.push(`drawtext=textfile='${subtitleFile}':fontcolor=white@0.9:fontsize=27:x=60:y=${subtitleY}:enable='${enable}'`);
  });

  const liveTitleFile = join(tempDir, "live-title.txt");
  const liveSubtitleFile = join(tempDir, "live-subtitle.txt");
  writeFileSync(liveTitleFile, "", "utf8");
  writeFileSync(liveSubtitleFile, "", "utf8");
  filters.push(`drawtext=textfile='${liveTitleFile}':reload=1:fontcolor=white:fontsize=36:x=60:y=70:box=1:boxcolor=black@0.72:boxborderw=16:borderw=2:bordercolor=black`);
  filters.push(`drawtext=textfile='${liveSubtitleFile}':reload=1:fontcolor=white:fontsize=28:x=60:y=132:box=1:boxcolor=black@0.72:boxborderw=16:borderw=2:bordercolor=black`);

  return { filter: filters.join(","), tempDir, scenes, liveTitleFile, liveSubtitleFile };
}

function clearLiveOverlay(job) {
  if (!job?.liveTitleFile || !job?.liveSubtitleFile) return;
  try {
    writeFileSync(job.liveTitleFile, "", "utf8");
    writeFileSync(job.liveSubtitleFile, "", "utf8");
  } catch (error) {
    console.error("overlay_clear_failed", error);
  }
}

function updateLiveOverlay(jobId, payload) {
  const job = jobs.get(jobId);
  if (!job?.process || !job.liveTitleFile || !job.liveSubtitleFile) throw new Error("Active broadcast job not found.");
  const title = cleanOverlayText(payload?.title, 90);
  const subtitle = cleanOverlayText(payload?.subtitle, 180);
  if (!title && !subtitle) throw new Error("Overlay title or subtitle is required.");
  writeFileSync(job.liveTitleFile, title, "utf8");
  writeFileSync(job.liveSubtitleFile, subtitle, "utf8");
  const duration = Math.min(30, Math.max(3, Number(payload?.duration || 10)));
  if (job.overlayTimer) clearTimeout(job.overlayTimer);
  job.overlayTimer = setTimeout(() => {
    clearLiveOverlay(job);
    job.overlayTimer = null;
  }, duration * 1000);
  job.liveOverlay = { title, subtitle, duration, updatedAt: new Date().toISOString() };
  job.updatedAt = new Date().toISOString();
  return job.liveOverlay;
}

function decodeSpeechClip(mp3) {
  return new Promise((resolve, reject) => {
    const decoder = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ar", String(PCM_RATE), "-ac", String(PCM_CHANNELS), "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    let size = 0;
    decoder.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size <= 12_000_000) chunks.push(chunk);
    });
    decoder.stderr.on("data", (chunk) => { stderr += String(chunk); });
    decoder.on("error", reject);
    decoder.on("exit", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Speech decoder exited with ${code}.`));
      if (!chunks.length) return reject(new Error("Speech clip decoded to empty audio."));
      resolve(Buffer.concat(chunks));
    });
    decoder.stdin.end(mp3);
  });
}

function startSpeechFeeder(job) {
  const writer = createWriteStream(job.speechFifo);
  job.speechWriter = writer;
  job.speechQueue = [];
  job.speechCurrent = null;
  job.speechOffset = 0;
  job.speechPlayed = 0;

  writer.on("open", () => {
    job.speechTimer = setInterval(() => {
      if (!job.speechCurrent && job.speechQueue.length) {
        job.speechCurrent = job.speechQueue.shift();
        job.speechOffset = 0;
      }
      let frame = SILENCE_FRAME;
      if (job.speechCurrent) {
        const end = Math.min(job.speechOffset + FRAME_BYTES, job.speechCurrent.length);
        const chunk = job.speechCurrent.subarray(job.speechOffset, end);
        if (chunk.length === FRAME_BYTES) frame = chunk;
        else {
          frame = Buffer.alloc(FRAME_BYTES);
          chunk.copy(frame);
        }
        job.speechOffset = end;
        if (job.speechOffset >= job.speechCurrent.length) {
          job.speechCurrent = null;
          job.speechOffset = 0;
          job.speechPlayed += 1;
        }
      }
      if (!writer.destroyed) writer.write(frame);
    }, FRAME_MS);
  });

  writer.on("error", (error) => console.error("speech_fifo_writer_error", error));
}

async function enqueueSpeech(jobId, payload) {
  const job = jobs.get(jobId);
  if (!job?.process || !job.speechFifo) throw new Error("Active speech-enabled broadcast job not found.");
  const encoded = String(payload?.audioBase64 || "");
  if (!encoded) throw new Error("audioBase64 is required.");
  const mp3 = Buffer.from(encoded, "base64");
  if (!mp3.length || mp3.length > 1_500_000) throw new Error("Speech clip must be between 1 byte and 1.5 MB.");
  if ((job.speechQueue?.length || 0) >= 6) throw new Error("Live speech queue is full.");
  const pcm = await decodeSpeechClip(mp3);
  job.speechQueue.push(pcm);
  job.lastSpeechLabel = cleanOverlayText(payload?.label, 100) || null;
  job.updatedAt = new Date().toISOString();
  return { queued: job.speechQueue.length + (job.speechCurrent ? 1 : 0), played: job.speechPlayed || 0, label: job.lastSpeechLabel };
}

async function startJob(payload) {
  const { jobId, destination, presenter, scenePlan, product } = payload || {};
  if (!jobId || !destination?.serverUrl || !destination?.streamKey) throw new Error("jobId and RTMP destination credentials are required.");
  if (!presenter?.mediaUrl) throw new Error("A ready presenter mediaUrl is required for this worker.");
  if (jobs.get(jobId)?.process) throw new Error("Broadcast job is already running.");

  const output = buildOutputUrl(destination.serverUrl, destination.streamKey);
  const scene = buildSceneFilters(jobId, scenePlan);
  const productImageUrl = validHttpsUrl(product?.imageUrl);
  const speechFifo = join(scene.tempDir, "live-speech.pcm");
  const fifo = spawnSync("mkfifo", [speechFifo]);
  if (fifo.status !== 0) throw new Error("Unable to create live speech audio pipe.");

  const args = ["-hide_banner", "-loglevel", "warning", "-re", "-stream_loop", "-1", "-i", presenter.mediaUrl];
  let speechInputIndex = 1;
  if (productImageUrl) {
    args.push("-loop", "1", "-framerate", "30", "-i", productImageUrl);
    speechInputIndex = 2;
  }
  args.push("-thread_queue_size", "1024", "-f", "s16le", "-ar", String(PCM_RATE), "-ac", String(PCM_CHANNELS), "-i", speechFifo);

  const complex = [];
  if (productImageUrl) {
    complex.push(`[0:v]${scene.filter}[base]`);
    complex.push(`[1:v]scale=w=360:h=-1:force_original_aspect_ratio=decrease,format=rgba[product]`);
    complex.push(`[base][product]overlay=x=W-w-36:y=H-h-230:format=auto[outv]`);
  } else {
    complex.push(`[0:v]${scene.filter}[outv]`);
  }
  complex.push(`[0:a][${speechInputIndex}:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]`);
  args.push("-filter_complex", complex.join(";"), "-map", "[outv]", "-map", "[outa]");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-f", "flv", output);

  await report(jobId, "starting");
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  const job = {
    process: child,
    status: "starting",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenePlan: { version: scenePlan?.version || 1, layout: scenePlan?.layout || null, scenes: scene.scenes },
    product: productImageUrl ? { imageUrl: productImageUrl } : null,
    tempDir: scene.tempDir,
    liveTitleFile: scene.liveTitleFile,
    liveSubtitleFile: scene.liveSubtitleFile,
    liveOverlay: null,
    overlayTimer: null,
    speechFifo,
    speechWriter: null,
    speechTimer: null,
    speechQueue: [],
    speechCurrent: null,
    speechOffset: 0,
    speechPlayed: 0,
  };
  jobs.set(jobId, job);
  startSpeechFeeder(job);

  let liveReported = false;
  child.stderr.on("data", async (chunk) => {
    const line = String(chunk);
    console.log(`[${jobId}] ${line.trim()}`);
    if (!liveReported && /frame=|time=/.test(line)) {
      liveReported = true;
      await report(jobId, "live");
    }
  });

  child.on("error", async (error) => { await report(jobId, "error", error.message); });
  child.on("exit", async (code, signal) => {
    const current = jobs.get(jobId) || {};
    if (current.overlayTimer) clearTimeout(current.overlayTimer);
    if (current.speechTimer) clearInterval(current.speechTimer);
    if (current.speechWriter && !current.speechWriter.destroyed) current.speechWriter.destroy();
    if (current.tempDir) {
      try { rmSync(current.tempDir, { recursive: true, force: true }); } catch {}
    }
    jobs.set(jobId, { ...current, process: null, tempDir: null, liveTitleFile: null, liveSubtitleFile: null, overlayTimer: null, speechWriter: null, speechTimer: null, speechQueue: [], speechCurrent: null, exitCode: code, signal });
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
    const { process: _process, tempDir: _tempDir, liveTitleFile: _liveTitleFile, liveSubtitleFile: _liveSubtitleFile, overlayTimer: _overlayTimer, speechWriter: _speechWriter, speechTimer: _speechTimer, speechQueue: _speechQueue, speechCurrent: _speechCurrent, ...safe } = job;
    return json(res, 200, { job: { ...safe, speechQueued: (_speechQueue?.length || 0) + (_speechCurrent ? 1 : 0) } });
  }

  if (req.method === "POST" && url.pathname === "/broadcast") {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    try {
      const payload = await readJson(req);
      await startJob(payload);
      return json(res, 202, { ok: true, jobId: payload.jobId, status: "starting", scenes: normalizeScenes(payload.scenePlan).length, productImage: Boolean(validHttpsUrl(payload.product?.imageUrl)), speechMix: true });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Unable to start broadcast." });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/jobs/") && url.pathname.endsWith("/overlay")) {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length, -"/overlay".length));
    try {
      const payload = await readJson(req);
      const overlay = updateLiveOverlay(id, payload);
      return json(res, 202, { ok: true, jobId: id, overlay });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Unable to update live overlay." });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/jobs/") && url.pathname.endsWith("/speech")) {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length, -"/speech".length));
    try {
      const payload = await readJson(req);
      const queue = await enqueueSpeech(id, payload);
      return json(res, 202, { ok: true, jobId: id, queue });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Unable to queue live speech." });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/jobs/") && url.pathname.endsWith("/stop")) {
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized." });
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length, -"/stop".length));
    const job = jobs.get(id);
    if (!job?.process) return json(res, 404, { error: "Active job not found." });
    clearLiveOverlay(job);
    job.process.kill("SIGTERM");
    return json(res, 202, { ok: true, jobId: id, status: "stopping" });
  }

  return json(res, 404, { error: "Not found." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FacelessLive broadcast worker listening on ${PORT}`);
});
