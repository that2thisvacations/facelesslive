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
  const [autoSpeakReactions, setAutoSpeakReactions] = useState(false);
  const [message, setMessage] = useState("Choose how FacelessLive should handle spoken viewer responses.");
  const [saving, setSaving] = useState(false);

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
      const id = streamJobId || next[0]?.id || "";
      setStreamJobId(id);
      if (id) await loadPolicy(id);
      else setMessage("No active broadcasts found.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load broadcasts."); }
  }

  async function loadPolicy(id: string) {
    try {
      const { token } = await session();
      const response = await fetch(`/api/live/response-policy?streamJobId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load policy.");
      setMode(data.policy?.mode || "manual");
      setVoice(data.policy?.voice || "alloy");
      setAutoSpeakReactions(Boolean(data.policy?.auto_speak_reactions));
      setMessage(data.policy?.mode === "safe_auto" ? "Safe Auto-Speak is active for this stream." : "Manual approval is active for this stream.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load policy."); }
  }

  async function savePolicy() {
    if (!streamJobId) return setMessage("Choose an active broadcast first.");
    setSaving(true);
    try {
      const { token } = await session();
      const response = await fetch("/api/live/response-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ streamJobId, mode, voice, autoSpeakReactions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save response policy.");
      setMessage(mode === "safe_auto" ? "Safe Auto-Speak enabled. Sensitive questions remain approval-gated." : "Manual approval enabled. Nothing will be spoken automatically.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save response policy."); }
    finally { setSaving(false); }
  }

  useEffect(() => { void loadJobs(); }, []);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 850, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · RESPONSE AUTHORITY</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Live Response Policy</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>Manual mode keeps every spoken response operator-controlled. Safe Auto-Speak allows low-risk viewer responses to be voiced automatically while pricing, shipping, inventory, refund, guarantee, health, legal, and similar high-risk questions stay approval-gated.</p>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid rgba(242,189,73,.28)", borderRadius: 16, background: "rgba(255,255,255,.03)", display: "grid", gap: 13 }}>
        <select value={streamJobId} onChange={(e) => { setStreamJobId(e.target.value); void loadPolicy(e.target.value); }} style={fieldStyle}>
          {!jobs.length && <option value="">No active broadcasts</option>}
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.status.toUpperCase()} · {job.id}</option>)}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={fieldStyle}>
          <option value="manual">Manual Approval</option>
          <option value="safe_auto">Safe Auto-Speak</option>
        </select>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} style={fieldStyle}>{voices.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#c7d2df" }}><input type="checkbox" checked={autoSpeakReactions} onChange={(e) => setAutoSpeakReactions(e.target.checked)}/> Allow simple reactions such as “thanks” to auto-speak</label>
        <div style={{ padding: 14, borderRadius: 12, background: mode === "safe_auto" ? "rgba(242,189,73,.08)" : "rgba(255,255,255,.03)", color: "#9fb0c0", lineHeight: 1.55 }}>
          {mode === "safe_auto" ? "Low-risk responses may be spoken automatically. Sensitive commerce or regulated-topic questions remain text-only until approved." : "All speech remains manual. AI may still prepare text overlays, but the worker will not auto-queue speech."}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={savePolicy} disabled={saving || !streamJobId} style={primaryStyle}>{saving ? "Saving..." : "Save Response Policy"}</button><button onClick={loadJobs} disabled={saving} style={secondaryStyle}>Refresh Streams</button></div>
      </div>
      <p style={{ marginTop: 18, color: "#9fb0c0" }}>{message}</p>
    </section>
  </main>;
}

const fieldStyle: React.CSSProperties = { minHeight: 46, width: "100%", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 13px", background: "#0a1a2c", color: "#f6f7fb" };
const primaryStyle: React.CSSProperties = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { minHeight: 44, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
