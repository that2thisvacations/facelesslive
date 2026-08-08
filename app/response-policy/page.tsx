"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type StreamJob = { id: string; status: string; created_at: string };
const voices = ["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"];

export default function ResponsePolicyPage() {
  const [jobs, setJobs] = useState<StreamJob[]>([]);
  const [streamJobId, setStreamJobId] = useState("");
  const [mode, setMode] = useState("manual");
  const [voice, setVoice] = useState("alloy");
  const [maxSpokenPerMinute, setMaxSpokenPerMinute] = useState(4);
  const [speakReactions, setSpeakReactions] = useState(false);
  const [message, setMessage] = useState("Choose an active broadcast and set how AI live responses may be spoken.");
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
      const first = streamJobId || next[0]?.id || "";
      setStreamJobId(first);
      if (first) await loadPolicy(first);
      else setMessage("No starting or live broadcasts found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load broadcasts.");
    }
  }

  async function loadPolicy(id: string) {
    if (!id) return;
    try {
      const { token } = await session();
      const response = await fetch(`/api/live/policy?streamJobId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load response policy.");
      setMode(data.policy.mode || "manual");
      setVoice(data.policy.voice || "alloy");
      setMaxSpokenPerMinute(data.policy.max_spoken_per_minute || 4);
      setSpeakReactions(Boolean(data.policy.speak_reactions));
      setMessage(data.policy.mode === "safe_auto" ? "Safe Auto-Speak is active for this broadcast." : "Manual approval is active for this broadcast.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load response policy.");
    }
  }

  async function savePolicy() {
    if (!streamJobId) return setMessage("Choose an active broadcast first.");
    setLoading(true);
    try {
      const { token } = await session();
      const response = await fetch("/api/live/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ streamJobId, mode, voice, maxSpokenPerMinute, speakReactions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save response policy.");
      setMessage(mode === "safe_auto" ? "Safe Auto-Speak policy saved." : "Manual approval policy saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save response policy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadJobs(); }, []);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 860, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · RESPONSE SAFETY</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Live Response Policy</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>Manual mode requires operator control. Safe Auto-Speak only voices low-risk responses. Pricing, discounts, shipping, returns, inventory, guarantees, medical, legal, and similar claims stay approval-gated.</p>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid rgba(242,189,73,.28)", borderRadius: 16, background: "rgba(255,255,255,.03)", display: "grid", gap: 14 }}>
        <label style={labelStyle}>Active broadcast<select value={streamJobId} onChange={(e) => { setStreamJobId(e.target.value); void loadPolicy(e.target.value); }} style={fieldStyle}>{!jobs.length && <option value="">No active broadcasts</option>}{jobs.map((job) => <option key={job.id} value={job.id}>{job.status.toUpperCase()} · {job.id}</option>)}</select></label>
        <label style={labelStyle}>Response mode<select value={mode} onChange={(e) => setMode(e.target.value)} style={fieldStyle}><option value="manual">Manual Approval</option><option value="safe_auto">Safe Auto-Speak</option></select></label>
        <label style={labelStyle}>Voice<select value={voice} onChange={(e) => setVoice(e.target.value)} style={fieldStyle}>{voices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label style={labelStyle}>Maximum spoken responses per minute<input type="number" min={1} max={10} value={maxSpokenPerMinute} onChange={(e) => setMaxSpokenPerMinute(Number(e.target.value || 1))} style={fieldStyle}/></label>
        <label style={{ display: "flex", gap: 10, alignItems: "center", color: "#d9e2ea" }}><input type="checkbox" checked={speakReactions} onChange={(e) => setSpeakReactions(e.target.checked)}/> Allow simple reactions such as “Thanks for watching” to be spoken automatically</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={savePolicy} disabled={loading || !streamJobId} style={primaryStyle}>{loading ? "Saving..." : "Save Response Policy"}</button><button onClick={loadJobs} disabled={loading} style={secondaryStyle}>Refresh Broadcasts</button></div>
      </div>
      <p style={{ marginTop: 18, color: "#9fb0c0" }}>{message}</p>
    </section>
  </main>;
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 7, color: "#d9e2ea", fontWeight: 700 };
const fieldStyle: React.CSSProperties = { minHeight: 46, width: "100%", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 13px", background: "#0a1a2c", color: "#f6f7fb" };
const primaryStyle: React.CSSProperties = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { minHeight: 44, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
