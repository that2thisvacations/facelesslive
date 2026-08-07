"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type StreamJob = { id: string; status: string; created_at: string };
const voices = ["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"];

export default function LiveSpeechPage() {
  const [jobs, setJobs] = useState<StreamJob[]>([]);
  const [streamJobId, setStreamJobId] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("Queue a short spoken AI response into an active FacelessLive broadcast.");
  const [loading, setLoading] = useState(false);

  async function session() {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in from Stream Studio first.");
    return { supabase, token: data.session.access_token };
  }

  async function loadJobs() {
    try {
      const { supabase } = await session();
      const { data, error } = await supabase.from("stream_jobs").select("id,status,created_at").in("status", ["starting", "live"]).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const next = (data || []) as StreamJob[];
      setJobs(next);
      setStreamJobId((current) => current || next[0]?.id || "");
      setMessage(next.length ? "Active broadcast found. Spoken responses can be queued." : "No starting or live broadcasts found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load active broadcasts.");
    }
  }

  useEffect(() => { void loadJobs(); }, []);

  async function queueSpeech() {
    if (!streamJobId || !text.trim()) return setMessage("Choose an active broadcast and enter a short response.");
    setLoading(true);
    try {
      const { token } = await session();
      const response = await fetch("/api/live/speech/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ streamJobId, text: text.trim(), voice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to queue live speech.");
      setMessage(`Speech queued. ${data.queue?.queued ?? 0} clip(s) waiting; ${data.queue?.played ?? 0} played.`);
      setText("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue live speech.");
    } finally {
      setLoading(false);
    }
  }

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 820, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · LIVE AUDIO</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Spoken Response Console</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>Generate a short OpenAI voice response and place it into the broadcast worker's live audio queue. The worker mixes queued speech over the existing AI-presenter audio without restarting the RTMP session.</p>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid rgba(242,189,73,.28)", borderRadius: 16, background: "rgba(255,255,255,.03)", display: "grid", gap: 12 }}>
        <select value={streamJobId} onChange={(e) => setStreamJobId(e.target.value)} style={fieldStyle}>
          {!jobs.length && <option value="">No active broadcasts</option>}
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.status.toUpperCase()} · {job.id}</option>)}
        </select>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} style={fieldStyle}>{voices.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Example: Great question. This item is available through the product card shown on screen." style={{ ...fieldStyle, minHeight: 120, paddingTop: 12, resize: "vertical" }}/>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={queueSpeech} disabled={loading || !jobs.length || !text.trim()} style={primaryStyle}>{loading ? "Queuing..." : "Speak On Live"}</button>
          <button onClick={loadJobs} disabled={loading} style={secondaryStyle}>Refresh Broadcasts</button>
        </div>
      </div>
      <p style={{ marginTop: 18, color: "#9fb0c0" }}>{message}</p>
    </section>
  </main>;
}

const fieldStyle: React.CSSProperties = { minHeight: 46, width: "100%", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 13px", background: "#0a1a2c", color: "#f6f7fb" };
const primaryStyle: React.CSSProperties = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { minHeight: 44, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
