"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type StreamJob = { id: string; status: string; created_at: string };
type EventItem = { id: string; stream_job_id: string; source: string; event_type: string; viewer_name: string | null; message: string; response_text: string | null; status: string; speech_status: string; error_message: string | null; created_at: string };
const voices = ["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"];

export default function ModerationPage() {
  const [jobs, setJobs] = useState<StreamJob[]>([]);
  const [streamJobId, setStreamJobId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [voice, setVoice] = useState("alloy");
  const [message, setMessage] = useState("Review approval-gated live responses before they are spoken.");
  const [busyId, setBusyId] = useState("");
  const loadVersion = useRef(0);

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
      setMessage(next.length ? "Active broadcast loaded." : "No active broadcasts found.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load broadcasts."); }
  }

  async function loadEvents(jobId = streamJobId) {
    const version = ++loadVersion.current;
    try {
      const { token } = await session();
      const qs = jobId ? `?streamJobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/live/moderation${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load moderation queue.");
      if (version !== loadVersion.current) return;
      setEvents(data.events || []);
      setMessage(data.events?.length ? `${data.events.length} response(s) require review.` : "Moderation queue is clear.");
    } catch (error) {
      if (version !== loadVersion.current) return;
      setMessage(error instanceof Error ? error.message : "Unable to load moderation queue.");
    }
  }

  async function act(eventId: string, action: "approve_speech" | "ignore") {
    setBusyId(eventId);
    try {
      const { token } = await session();
      const response = await fetch("/api/live/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId, action, voice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Moderation action failed.");
      setEvents((current) => current.filter((item) => item.id !== eventId));
      setMessage(action === "approve_speech" ? "Approved response queued for live speech." : "Response ignored.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Moderation action failed."); }
    finally { setBusyId(""); }
  }

  useEffect(() => { void loadJobs(); }, []);
  useEffect(() => { if (streamJobId) void loadEvents(streamJobId); }, [streamJobId]);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 1040, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · MODERATION</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Live Response Approval Queue</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>Responses involving pricing, shipping, returns, health, legal, earnings, guarantees, inventory, and other gated topics stay here until you approve or ignore them.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: 10, marginTop: 24 }}>
        <select value={streamJobId} onChange={(e) => setStreamJobId(e.target.value)} style={fieldStyle}>{!jobs.length && <option value="">No active broadcasts</option>}{jobs.map((job) => <option key={job.id} value={job.id}>{job.status.toUpperCase()} · {job.id}</option>)}</select>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} style={fieldStyle}>{voices.map((item) => <option key={item}>{item}</option>)}</select>
        <button onClick={() => loadEvents()} style={secondaryStyle}>Refresh Queue</button>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {events.map((event) => <article key={event.id} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 18, background: "rgba(255,255,255,.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{event.viewer_name ? `@${event.viewer_name}` : event.source.toUpperCase()}</strong><span style={{ color: "#f2bd49", fontSize: 12, fontWeight: 800 }}>{event.speech_status.replaceAll("_", " ").toUpperCase()}</span></div>
          <p style={{ color: "#9fb0c0", marginBottom: 8 }}>Viewer: {event.message}</p>
          <p style={{ lineHeight: 1.55, marginTop: 0 }}>AI response: {event.response_text || "No response generated."}</p>
          {event.error_message && <p style={{ color: "#f5a5a5" }}>{event.error_message}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button disabled={busyId === event.id || !event.response_text} onClick={() => act(event.id, "approve_speech")} style={primaryStyle}>{busyId === event.id ? "Working..." : "Approve & Speak"}</button><button disabled={busyId === event.id} onClick={() => act(event.id, "ignore")} style={secondaryStyle}>Ignore</button></div>
        </article>)}
      </div>
      <p style={{ color: "#9fb0c0", marginTop: 18 }}>{message}</p>
    </section>
  </main>;
}

const fieldStyle: React.CSSProperties = { minHeight: 46, width: "100%", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 13px", background: "#0a1a2c", color: "#f6f7fb" };
const primaryStyle: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 11, padding: "0 16px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { minHeight: 42, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
