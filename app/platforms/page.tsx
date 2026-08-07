"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type StreamJob = { id: string; status: string; created_at: string };
type Mapping = { id: string; platform: string; external_stream_id: string; stream_job_id: string; updated_at: string };

const platforms = ["tiktok", "youtube", "facebook", "instagram", "custom"];

export default function PlatformConnectionsPage() {
  const [jobs, setJobs] = useState<StreamJob[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [platform, setPlatform] = useState("youtube");
  const [externalStreamId, setExternalStreamId] = useState("");
  const [streamJobId, setStreamJobId] = useState("");
  const [message, setMessage] = useState("Sign in from Stream Studio, then map a platform live ID to an active FacelessLive broadcast.");
  const [loading, setLoading] = useState(false);

  async function token() {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in from Stream Studio first.");
    return { supabase, token: data.session.access_token };
  }

  async function load() {
    setLoading(true);
    try {
      const { supabase, token: accessToken } = await token();
      const [{ data: jobData, error: jobError }, mappingResponse] = await Promise.all([
        supabase.from("stream_jobs").select("id,status,created_at").in("status", ["ready", "queued", "starting", "live"]).order("created_at", { ascending: false }).limit(20),
        fetch("/api/live/mappings", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }),
      ]);
      if (jobError) throw jobError;
      const mappingData = await mappingResponse.json();
      if (!mappingResponse.ok) throw new Error(mappingData.error || "Unable to load platform mappings.");
      const nextJobs = (jobData || []) as StreamJob[];
      setJobs(nextJobs);
      setMappings(mappingData.mappings || []);
      setStreamJobId((current) => current || nextJobs[0]?.id || "");
      setMessage(nextJobs.length ? "Platform mapping controls ready." : "Start or prepare a broadcast in Stream Studio first.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load platform controls.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveMapping() {
    if (!externalStreamId.trim() || !streamJobId) return setMessage("Enter the platform live ID and choose a FacelessLive stream job.");
    setLoading(true);
    try {
      const { token: accessToken } = await token();
      const response = await fetch("/api/live/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ platform, externalStreamId: externalStreamId.trim(), streamJobId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save mapping.");
      setExternalStreamId("");
      setMessage(`${platform} live ID mapped to FacelessLive.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save mapping.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMapping(id: string) {
    setLoading(true);
    try {
      const { token: accessToken } = await token();
      const response = await fetch(`/api/live/mappings?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove mapping.");
      setMessage("Platform mapping removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove mapping.");
    } finally {
      setLoading(false);
    }
  }

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 980, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · STREAM STUDIO</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Platform Connections</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6, maxWidth: 760 }}>Map the live-video or live-chat identifier supplied by YouTube, Facebook, Instagram, TikTok, or a custom adapter to the active FacelessLive broadcast. Incoming comments can then resolve the correct stream automatically.</p>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid rgba(242,189,73,.28)", borderRadius: 16, background: "rgba(255,255,255,.03)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={fieldStyle}>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <input value={externalStreamId} onChange={(e) => setExternalStreamId(e.target.value)} placeholder="Platform live ID / live video ID / live chat ID" style={fieldStyle}/>
        </div>
        <select value={streamJobId} onChange={(e) => setStreamJobId(e.target.value)} style={{ ...fieldStyle, marginTop: 12, width: "100%" }}>
          {!jobs.length && <option value="">No active FacelessLive stream jobs</option>}
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.status.toUpperCase()} · {job.id}</option>)}
        </select>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={saveMapping} disabled={loading || !jobs.length} style={primaryStyle}>Save Mapping</button>
          <button onClick={load} disabled={loading} style={secondaryStyle}>Refresh</button>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {mappings.map((mapping) => <div key={mapping.id} style={{ padding: 16, border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, background: "rgba(255,255,255,.025)", display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 12, alignItems: "center" }}>
          <strong style={{ color: "#f2bd49", textTransform: "uppercase" }}>{mapping.platform}</strong>
          <div><div style={{ fontWeight: 700 }}>{mapping.external_stream_id}</div><small style={{ color: "#9fb0c0" }}>FacelessLive job: {mapping.stream_job_id}</small></div>
          <button onClick={() => removeMapping(mapping.id)} disabled={loading} style={secondaryStyle}>Remove</button>
        </div>)}
        {!mappings.length && <p style={{ color: "#9fb0c0" }}>No platform mappings saved yet.</p>}
      </div>
      <p style={{ marginTop: 18, color: "#9fb0c0" }}>{message}</p>
    </section>
  </main>;
}

const fieldStyle: React.CSSProperties = { minHeight: 46, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 13px", background: "#0a1a2c", color: "#f6f7fb" };
const primaryStyle: React.CSSProperties = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { minHeight: 44, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
