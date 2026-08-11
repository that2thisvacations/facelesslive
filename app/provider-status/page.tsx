"use client";

import { useEffect, useState } from "react";

type ProviderStatus = {
  youtube: { oauthConfigured: boolean; connectorConfigured: boolean; callbackUrl: string | null };
  meta: { oauthConfigured: boolean; webhookConfigured: boolean; webhookUrl: string | null; callbackUrl: string | null };
};

export default function ProviderStatusPage() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [message, setMessage] = useState("Checking provider configuration...");

  async function load() {
    try {
      const response = await fetch("/api/providers/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to read provider status.");
      setStatus(data);
      setMessage("Provider readiness loaded. No secrets are exposed in this view.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to read provider status."); }
  }

  useEffect(() => { void load(); }, []);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 920, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · PROVIDERS</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>YouTube & Meta Connection Readiness</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>This checks whether the credentials and webhook prerequisites needed for the provider connection flow are configured. It does not expose the credentials themselves.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 24 }}>
        <StatusCard title="YouTube" rows={[
          ["OAuth credentials", status?.youtube.oauthConfigured],
          ["Live connector secret", status?.youtube.connectorConfigured],
        ]} details={[status?.youtube.callbackUrl ? `OAuth callback: ${status.youtube.callbackUrl}` : "Set NEXT_PUBLIC_APP_URL to generate the callback URL."]}/>
        <StatusCard title="Meta" rows={[
          ["OAuth credentials", status?.meta.oauthConfigured],
          ["Webhook credentials", status?.meta.webhookConfigured],
        ]} details={[
          status?.meta.webhookUrl ? `Webhook: ${status.meta.webhookUrl}` : "Set NEXT_PUBLIC_APP_URL to generate the webhook URL.",
          status?.meta.callbackUrl ? `OAuth callback: ${status.meta.callbackUrl}` : "Meta callback URL pending app URL configuration.",
        ]}/>
      </div>
      <button onClick={load} style={{ marginTop: 18, minHeight: 42, border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "0 16px", background: "transparent", color: "#f6f7fb", fontWeight: 700, cursor: "pointer" }}>Refresh Status</button>
      <p style={{ color: "#9fb0c0", marginTop: 18 }}>{message}</p>
    </section>
  </main>;
}

function StatusCard({ title, rows, details }: { title: string; rows: Array<[string, boolean | undefined]>; details: string[] }) {
  return <article style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 20, background: "rgba(255,255,255,.03)" }}>
    <h2 style={{ marginTop: 0 }}>{title}</h2>
    <div style={{ display: "grid", gap: 9 }}>{rows.map(([label, ready]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "#9fb0c0" }}>{label}</span><strong style={{ color: ready ? "#b9f4c8" : "#f2bd49" }}>{ready ? "READY" : "NEEDS SETUP"}</strong></div>)}</div>
    <div style={{ marginTop: 16, display: "grid", gap: 7 }}>{details.map((item) => <small key={item} style={{ color: "#9fb0c0", wordBreak: "break-word" }}>{item}</small>)}</div>
  </article>;
}
