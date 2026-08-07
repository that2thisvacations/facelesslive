"use client";

import { useEffect, useState } from "react";

type Provider = { id: string; name: string; configured: boolean; status: string; requirements: string[] };

export default function ProviderStatusPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState("Checking FacelessLive provider readiness...");

  async function load() {
    try {
      const response = await fetch("/api/live/providers/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load provider status.");
      setProviders(data.providers || []);
      setMessage("Provider status refreshed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load provider status."); }
  }

  useEffect(() => { void load(); }, []);

  return <main style={{ minHeight: "100vh", background: "#071421", color: "#f6f7fb", padding: "40px 5vw", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 950, margin: "0 auto" }}>
      <p style={{ color: "#f2bd49", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>FACELESSLIVE · PROVIDER CONNECTIONS</p>
      <h1 style={{ fontSize: 38, margin: "8px 0 10px" }}>Live Platform Readiness</h1>
      <p style={{ color: "#9fb0c0", lineHeight: 1.6 }}>This screen shows whether the FacelessLive server has the required configuration for each live integration. Provider OAuth, webhook subscription, and platform approval still have to be completed with the provider where required.</p>

      <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
        {providers.map((provider) => <article key={provider.id} style={{ padding: 20, border: `1px solid ${provider.configured ? "rgba(68,208,140,.35)" : "rgba(242,189,73,.28)"}`, borderRadius: 16, background: "rgba(255,255,255,.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div><strong style={{ fontSize: 20 }}>{provider.name}</strong><div style={{ color: "#9fb0c0", marginTop: 5 }}>{provider.status.replaceAll("_", " ").toUpperCase()}</div></div>
            <span style={{ padding: "7px 11px", borderRadius: 999, background: provider.configured ? "rgba(68,208,140,.12)" : "rgba(242,189,73,.11)", color: provider.configured ? "#77e2ad" : "#f2bd49", fontWeight: 800, fontSize: 12 }}>{provider.configured ? "SERVER READY" : "SETUP REQUIRED"}</span>
          </div>
          <div style={{ marginTop: 15, color: "#c7d2df" }}><strong>Requirements</strong><ul style={{ lineHeight: 1.7, color: "#9fb0c0" }}>{provider.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </article>)}
      </div>

      <button onClick={load} style={{ marginTop: 18, minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#f2bd49", color: "#071421", fontWeight: 800, cursor: "pointer" }}>Refresh Status</button>
      <p style={{ marginTop: 16, color: "#9fb0c0" }}>{message}</p>
    </section>
  </main>;
}
