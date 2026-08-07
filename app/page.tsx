"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Bot, Check, ChevronLeft, ChevronRight, LoaderCircle, Package, Radio, Save, Sparkles } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { PrintifyPicker } from "@/components/printify-picker";
import { RtmpPanel, type RtmpConfig } from "@/components/rtmp-panel";
import { StreamLaunchPanel } from "@/components/stream-launch-panel";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const steps = ["Product", "AI Host", "Script", "Stream", "Launch"];
const starterProducts = [
  { id: "portable-blender", name: "Portable Blender", price: "$39.99", detail: "High-energy demo product" },
  { id: "travel-organizer", name: "Travel Organizer", price: "$24.99", detail: "Problem-and-solution presentation" },
  { id: "led-lamp", name: "Rechargeable LED Lamp", price: "$29.99", detail: "Feature-led product showcase" },
];
const hosts = [
  { id: "professor", name: "The Professor", style: "Confident educator", initials: "TP" },
  { id: "trend", name: "Trend Guide", style: "Fast social seller", initials: "TG" },
  { id: "expert", name: "Product Expert", style: "Calm demonstration host", initials: "PE" },
];
const layouts = ["Host + Product", "Product Focus", "Offer Countdown"];
const DRAFT_KEY = "facelesslive-stream-draft";
type ProductChoice = { id: string; name: string; price: string; detail: string; imageUrl?: string };

export default function Home() {
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState<ProductChoice[]>(starterProducts);
  const [productId, setProductId] = useState(starterProducts[0].id);
  const [hostId, setHostId] = useState(hosts[0].id);
  const [layout, setLayout] = useState(layouts[0]);
  const [script, setScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);

  const product = useMemo(() => products.find((item) => item.id === productId) ?? products[0], [products, productId]);
  const host = useMemo(() => hosts.find((item) => item.id === hostId) ?? hosts[0], [hostId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as { productId?: string; hostId?: string; layout?: string; script?: string };
      if (draft.productId) setProductId(draft.productId);
      if (draft.hostId) setHostId(draft.hostId);
      if (draft.layout) setLayout(draft.layout);
      if (draft.script) setScript(draft.script);
      setMessage("Saved device draft restored");
    } catch { window.localStorage.removeItem(DRAFT_KEY); }
  }, []);

  async function generateScript() {
    setIsGenerating(true); setMessage("");
    try {
      const response = await fetch("/api/scripts/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: product.name, productPrice: product.price, hostStyle: host.style, tone: hostId === "professor" ? "educational" : hostId === "trend" ? "energetic" : "demonstration" }) });
      const data = (await response.json()) as { script?: string; error?: string };
      if (!response.ok || !data.script) throw new Error(data.error || "Script generation failed.");
      setScript(data.script); setMessage("Fresh sales script generated");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Script generation failed."); }
    finally { setIsGenerating(false); }
  }

  async function saveDraft() {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ productId, hostId, layout, script }));
    if (!user) return setMessage("Draft saved on this device. Sign in to save it to the cloud.");
    const supabase = getSupabaseBrowser();
    if (!supabase) return setMessage("Supabase is not configured.");
    const { error } = await supabase.from("stream_drafts").insert({ owner_id: user.id, product_id: null, host_id: hostId, layout_id: layout, script, status: script ? "ready" : "draft" });
    setMessage(error ? error.message : "Draft saved to your FacelessLive cloud account.");
  }

  function addPrintifyProduct(nextProduct: ProductChoice) {
    setProducts((current) => current.some((item) => item.id === nextProduct.id) ? current.map((item) => item.id === nextProduct.id ? nextProduct : item) : [nextProduct, ...current]);
    setProductId(nextProduct.id);
    setMessage(`${nextProduct.name} imported from Printify${nextProduct.imageUrl ? " with product image" : ""}.`);
  }

  async function saveRtmp(config: RtmpConfig) {
    const supabase = getSupabaseBrowser();
    if (!user || !supabase) return setMessage("Sign in before saving an RTMP destination.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return setMessage("Your session expired. Sign in again.");
    const response = await fetch("/api/destinations/rtmp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(config) });
    const result = await response.json();
    setMessage(response.ok ? "Encrypted RTMP destination saved." : result.error || "Unable to save RTMP destination.");
  }

  async function next() { if (step === 2 && !script) await generateScript(); setStep((current) => Math.min(current + 1, steps.length - 1)); }

  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">F</span><span>FacelessLive</span></div><div className="headerActions"><span className="saveMessage">{message}</span><button className="ghostButton compact" onClick={saveDraft}><Save size={16}/> Save Draft</button><span className="buildBadge">STREAM STUDIO</span></div></header>
    <section className="accountStrip"><AuthPanel onUser={setUser}/></section>
    <section className="builderShell">
      <aside className="builderIntro"><p className="eyebrow">CREATE A FACELESS STREAM</p><h1>Build the show.<br/><span>Skip the camera.</span></h1><p className="heroCopy">Choose a product, assign an AI host, generate the selling script, configure a destination, preview the AI voice, and create the broadcast job.</p><div className="summaryCard"><span>Current build</span><strong>{product.name}</strong><small>{host.name} · {layout}</small></div></aside>
      <section className="wizardPanel">
        <div className="stepRail">{steps.map((label, index) => <button className={index === step ? "step active" : index < step ? "step done" : "step"} key={label} onClick={() => setStep(index)}><span>{index < step ? <Check size={15}/> : index + 1}</span>{label}</button>)}</div>
        <div className="stepContent">
          {step === 0 && <SelectionStep title="Select a product" subtitle="Choose a sample product or load products from Printify."><div className="choiceGrid">{products.map((item) => <button key={item.id} onClick={() => setProductId(item.id)} className={productId === item.id ? "choiceCard selected" : "choiceCard"}>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy"/> : <Package size={23}/>}<strong>{item.name}</strong><span>{item.detail}</span><b>{item.price}</b></button>)}</div><PrintifyPicker onSelect={addPrintifyProduct}/></SelectionStep>}
          {step === 1 && <SelectionStep title="Choose your AI host" subtitle="Match the presenter personality to the product and audience."><div className="choiceGrid">{hosts.map((item) => <button key={item.id} onClick={() => setHostId(item.id)} className={hostId === item.id ? "choiceCard selected" : "choiceCard"}><span className="avatar">{item.initials}</span><strong>{item.name}</strong><span>{item.style}</span></button>)}</div></SelectionStep>}
          {step === 2 && <SelectionStep title="Generate the sales script" subtitle="Create AI-backed copy, then edit the exact words your host will say."><button className="generateButton" onClick={generateScript} disabled={isGenerating}>{isGenerating ? <LoaderCircle className="spin" size={18}/> : <Sparkles size={18}/>} {isGenerating ? "Generating..." : "Generate script"}</button><textarea value={script} onChange={(event) => setScript(event.target.value)} placeholder="Your livestream script will appear here..."/></SelectionStep>}
          {step === 3 && <SelectionStep title="Design the stream" subtitle="Choose a layout, then configure a secure broadcast destination."><div className="layoutGrid">{layouts.map((item) => <button key={item} className={layout === item ? "layoutCard selected" : "layoutCard"} onClick={() => setLayout(item)}><div className="miniStage"><span/><i/><b/></div><strong>{item}</strong></button>)}</div><RtmpPanel onSave={saveRtmp}/></SelectionStep>}
          {step === 4 && <SelectionStep title="Launch Stream Studio" subtitle="Preview the AI voice, choose the destination, and create the broadcast job."><div className="launchCard"><div className="launchIcon"><Radio size={26}/></div><div><p>STREAM PACKAGE READY</p><h3>{product.name}</h3><span>{host.name} · {layout}</span></div></div><div className="checkList"><span><Check size={16}/> Product selected</span><span><Check size={16}/> AI host assigned</span><span><Check size={16}/> Sales script prepared</span><span><Check size={16}/> Stream layout configured</span></div><StreamLaunchPanel user={user} script={script} productName={product.name} productImageUrl={product.imageUrl} hostName={host.name} layout={layout}/></SelectionStep>}
        </div>
        <footer className="wizardFooter"><button className="ghostButton" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}><ChevronLeft size={18}/> Back</button>{step < steps.length - 1 && <button className="primaryButton" onClick={next} disabled={isGenerating}>Continue <ChevronRight size={18}/></button>}</footer>
      </section>
    </section>
  </main>;
}

function SelectionStep({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div><div className="contentHeading"><div className="iconBox"><Bot size={21}/></div><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</div>; }
