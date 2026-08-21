"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, CircleDollarSign, Gauge, Plane, Radio, ShieldCheck } from "lucide-react";
import type { AffiliateProduct, ChannelPolicy, CommerceChannelId, CommercePlan } from "@/lib/travel-commerce";
import "./commerce.css";

type CatalogProduct = AffiliateProduct & { score: number };
type CatalogResponse = { products: CatalogProduct[]; channels: ChannelPolicy[]; notice: string };

export default function CommercePage() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [channelId, setChannelId] = useState<CommerceChannelId>("owned_web");
  const [productId, setProductId] = useState("");
  const [plan, setPlan] = useState<CommercePlan | null>(null);
  const [message, setMessage] = useState("Loading travel commerce controls...");

  useEffect(() => {
    fetch("/api/commerce/catalog")
      .then((response) => response.json())
      .then((data: CatalogResponse) => {
        setCatalog(data);
        setProductId(data.products[0]?.id || "");
        setMessage(data.notice);
      })
      .catch(() => setMessage("Unable to load the travel product catalog."));
  }, []);

  const channel = useMemo(() => catalog?.channels.find((item) => item.id === channelId), [catalog, channelId]);

  async function createPlan(requestAutoLaunch = false) {
    setMessage(requestAutoLaunch ? "Checking autonomous launch eligibility..." : "Building governed sales cycle...");
    const response = await fetch("/api/commerce/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, productId, requestAutoLaunch }),
    });
    const data = await response.json() as { plan?: CommercePlan; error?: string; decision?: string };
    if (data.plan) setPlan(data.plan);
    setMessage(response.ok ? `Decision: ${data.decision}` : data.error || "Unable to build plan.");
  }

  return <main className="commercePage">
    <section className="commerceHero">
      <div><p>FACELESSLIVE AI™</p><h1>Travel Commerce<br/><span>Command Center</span></h1><div className="commerceLead">Build adaptive affiliate presentations, route them through channel-specific rules, and keep the AI host selling where autonomous operation is permitted.</div></div>
      <div className="networkCard"><Radio/><strong>24/7 NETWORK FOUNDATION</strong><span>Autonomous on owned channels · governed everywhere else</span></div>
    </section>

    <section className="commerceGrid">
      <div className="controlPanel">
        <div className="sectionTitle"><Bot/><div><h2>Automation Planner</h2><p>Select the channel and product before generating the next sales cycle.</p></div></div>
        <label>Commerce channel<select value={channelId} onChange={(event) => { setChannelId(event.target.value as CommerceChannelId); setPlan(null); }}>{catalog?.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Travel product<select value={productId} onChange={(event) => { setProductId(event.target.value); setPlan(null); }}>{catalog?.products.map((item) => <option key={item.id} value={item.id}>{item.name} · Score {item.score}</option>)}</select></label>
        {channel && <div className={channel.mode === "autonomous" ? "policyBanner autonomous" : "policyBanner supervised"}>
          {channel.mode === "autonomous" ? <CheckCircle2/> : <ShieldCheck/>}
          <div><strong>{channel.mode.replace("_", " ").toUpperCase()}</strong><span>{channel.permitsUnattendedAvatar ? "Unattended AI avatar permitted by current internal policy." : "Human oversight remains required for this destination."}</span></div>
        </div>}
        <div className="plannerActions"><button onClick={() => createPlan(false)}>Build Sales Cycle</button><button className="launchAttempt" onClick={() => createPlan(true)}>Check Auto Launch</button></div>
        <p className="plannerMessage">{message}</p>
      </div>

      <div className="metricStack">
        <Metric icon={<Plane/>} label="Travel products" value={String(catalog?.products.length ?? 0)} detail="Starter product intelligence records"/>
        <Metric icon={<Gauge/>} label="Operating mode" value={channel?.mode.replace("_", " ") ?? "—"} detail={channel?.requiresHumanPresence ? "Human presence required" : "Autonomous eligible"}/>
        <Metric icon={<CircleDollarSign/>} label="Projected commission" value={plan ? `$${(plan.projectedCommissionCents / 100).toFixed(2)}` : "—"} detail="Per converted starter product"/>
      </div>
    </section>

    {plan && <section className="planPanel">
      <div className="planHeading"><div><p>ADAPTIVE SALES SEQUENCE</p><h2>{plan.product.name}</h2><span>{plan.product.problemSolved}</span></div><div className="scoreDial"><strong>{plan.score}</strong><span>QUALITY SCORE</span></div></div>
      <div className="salesBlocks">{plan.blocks.map((block, index) => <article key={`${block.type}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{block.type.replace("_", " ")}</strong><span>{block.instruction}</span><small>{block.durationSeconds} seconds</small></div></article>)}</div>
      <div className="guardrailBox"><AlertTriangle/><div><strong>Launch guardrails</strong>{plan.guardrails.map((guardrail) => <span key={guardrail}>{guardrail}</span>)}</div></div>
    </section>}
  </main>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="commerceMetric"><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
