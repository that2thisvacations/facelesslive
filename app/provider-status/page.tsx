"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type ProviderStatus = {
  youtube: { oauthConfigured: boolean; connectorConfigured: boolean; callbackUrl: string | null };
  meta: { oauthConfigured: boolean; webhookConfigured: boolean; webhookUrl: string | null; callbackUrl: string | null };
};
type Connection = { provider: "youtube" | "meta"; status: string; provider_account_id: string | null; provider_account_name: string | null; scopes: string[]; expires_at: string | null; updated_at: string };

export default function ProviderStatusPage() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [message, setMessage] = useState("Checking provider configuration...");
  const [busy, setBusy] = useState("");
  const connectionMap = useMemo(() => new Map(connections.map((item) => [item.provider, item])), [connections]);

  async function sessionToken() {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in from Stream Studio first.");
    return data.session.access_token;
  }

  async function load() {
    try {
      const response = await fetch("/api/providers/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to read provider status.");
      setStatus(data);
      try {
        const token = await sessionToken();
        const connectionResponse = await fetch("/api/providers/connections", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const connectionData = await connectionResponse.json();
        if (connectionResponse.ok) setConnections(connectionData.connections || []);
      } catch {}
      setMessage("Provider readiness loaded. Stored access tokens remain encrypted server-side.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to read provider status."); }
  }

  async function connect(provider: "youtube" | "meta") {
    setBusy(provider); setMessage(`Starting ${provider} connection...`);
    try {
      const token = await sessionToken();
      const response = await fetch(`/api/providers/${provider}/start`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.authorizeUrl) throw new Error(data.error || "Unable to start provider connection.");
      window.location.assign(data.authorizeUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start provider connection."); setBusy(""); }
  }

  async function disconnect(provider: "youtube" | "meta") {
    setBusy(provider); setMessage(`Disconnecting ${provider}...`);
    try {
      const token = await sessionToken();
      const response = await fetch(`/api/providers/connections?provider=${provider}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to disconnect provider.");
      setConnections((current) => current.filter((item) => item.provider !== provider));
      setMessage(`${provider === "youtube" ? "YouTube" : "Meta"} disconnected from FacelessLive.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to disconnect provider."); }
    finally { setBusy(""); }
  }

  useEffect(() => { void load(); }, []);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 920, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · PROVIDERS</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>YouTube & Meta Connections</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>Connect provider accounts for live-chat intake and platform mapping. OAuth access and refresh tokens are encrypted before storage and are never returned to this page.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 24 }}>
        <StatusCard title="YouTube" connected={connectionMap.get("youtube")} rows={[["OAuth credentials", status?.youtube.oauthConfigured],["Live connector secret", status?.youtube.connectorConfigured]]} details={[status?.youtube.callbackUrl ? `OAuth callback: ${status.youtube.callbackUrl}` : "Set NEXT_PUBLIC_APP_URL to generate the callback URL."]} onConnect={() => connect("youtube")} onDisconnect={() => disconnect("youtube")} busy={busy === "youtube"}/>
        <StatusCard title="Meta" connected={connectionMap.get("meta")} rows={[["OAuth credentials", status?.meta.oauthConfigured],["Webhook credentials", status?.meta.webhookConfigured]]} details={[status?.meta.webhookUrl ? `Webhook: ${status.meta.webhookUrl}` : "Set NEXT_PUBLIC_APP_URL to generate the webhook URL.",status?.meta.callbackUrl ? `OAuth callback: ${status.meta.callbackUrl}` : "Meta callback URL pending app URL configuration."]} onConnect={() => connect("meta")} onDisconnect={() => disconnect("meta")} busy={busy === "meta"}/>
      </div>
      <button onClick={load} style={secondaryStyle}>Refresh Status</button>
      <p style={{ color: "#9fb0c0", marginTop: 18 }}>{message}</p>
    </section>
  </main>;
}

function StatusCard({ title, rows, details, connected, onConnect, onDisconnect, busy }: { title: string; rows: Array<[string, boolean | undefined]>; details: string[]; connected?: Connection; onConnect: () => void; onDisconnect: () => void; busy: boolean }) {
  return <article style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 20, background: "rgba(255,255,255,.03)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><h2 style={{ margin: 0 }}>{title}</h2><strong style={{ color: connected ? "#b9f4c8" : "#f2bd49", fontSize: 12 }}>{connected ? "CONNECTED" : "NOT CONNECTED"}</strong></div>
    {connected?.provider_account_name && <p style={{ color: "#f6f7fb", marginBottom: 8 }}>{connected.provider_account_name}</p>}
    <div style={{ display: "grid", gap: 9, marginTop: 16 }}>{rows.map(([label, ready]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "#9fb0c0" }}>{label}</span><strong style={{ color: ready ? "#b9f4c8" : "#f2bd49" }}>{ready ? "READY" : "NEEDS SETUP"}</strong></div>)}</div>
    <div style={{ marginTop: 16, display: "grid", gap: 7 }}>{details.map((item) => <small key={item} style={{ color: "#9fb0c0", wordBreak: "break-word" }}>{item}</small>)}</div>
    <button disabled={busy} onClick={connected ? onDisconnect : onConnect} style={connected ? secondaryStyle : primaryStyle}>{busy ? "Working..." : connected ? "Disconnect" : `Connect ${title}`}</button>
  </article>;
}

const primaryStyle: React.CSSProperties = { marginTop: 18, minHeight: 42, border: 0, borderRadius: 11, padding: "0 16px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { marginTop: 18, minHeight: 42, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" };
