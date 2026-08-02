"use client";

import { useMemo, useState } from "react";
import { Bot, Check, ChevronLeft, ChevronRight, Package, Radio, Sparkles } from "lucide-react";

const steps = ["Product", "AI Host", "Script", "Stream", "Launch"];
const products = [
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

export default function Home() {
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(products[0].id);
  const [hostId, setHostId] = useState(hosts[0].id);
  const [layout, setLayout] = useState(layouts[0]);
  const [script, setScript] = useState("");

  const product = useMemo(() => products.find((item) => item.id === productId) ?? products[0], [productId]);
  const host = useMemo(() => hosts.find((item) => item.id === hostId) ?? hosts[0], [hostId]);

  function generateScript() {
    setScript(`Stop scrolling. This ${product.name.toLowerCase()} makes everyday life easier without adding another complicated gadget to your routine. Watch how quickly it works, see the details up close, and tap the product before today’s featured offer ends.`);
  }

  function next() {
    if (step === 2 && !script) generateScript();
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark">F</span><span>FacelessLive</span></div>
        <span className="buildBadge">MVP BUILDER</span>
      </header>

      <section className="builderShell">
        <aside className="builderIntro">
          <p className="eyebrow">CREATE A FACELESS STREAM</p>
          <h1>Build the show.<br /><span>Skip the camera.</span></h1>
          <p className="heroCopy">Choose a product, assign an AI host, generate the selling script, and prepare a launch-ready stream in one guided flow.</p>
          <div className="summaryCard">
            <span>Current build</span>
            <strong>{product.name}</strong>
            <small>{host.name} · {layout}</small>
          </div>
        </aside>

        <section className="wizardPanel">
          <div className="stepRail">
            {steps.map((label, index) => (
              <button className={index === step ? "step active" : index < step ? "step done" : "step"} key={label} onClick={() => setStep(index)}>
                <span>{index < step ? <Check size={15} /> : index + 1}</span>{label}
              </button>
            ))}
          </div>

          <div className="stepContent">
            {step === 0 && <SelectionStep title="Select a product" subtitle="Choose what the AI host will present during the stream.">
              <div className="choiceGrid">{products.map((item) => <button key={item.id} onClick={() => setProductId(item.id)} className={productId === item.id ? "choiceCard selected" : "choiceCard"}><Package size={23} /><strong>{item.name}</strong><span>{item.detail}</span><b>{item.price}</b></button>)}</div>
            </SelectionStep>}

            {step === 1 && <SelectionStep title="Choose your AI host" subtitle="Match the presenter personality to the product and audience.">
              <div className="choiceGrid">{hosts.map((item) => <button key={item.id} onClick={() => setHostId(item.id)} className={hostId === item.id ? "choiceCard selected" : "choiceCard"}><span className="avatar">{item.initials}</span><strong>{item.name}</strong><span>{item.style}</span></button>)}</div>
            </SelectionStep>}

            {step === 2 && <SelectionStep title="Generate the sales script" subtitle="Start with AI copy, then edit the exact words your host will say.">
              <button className="generateButton" onClick={generateScript}><Sparkles size={18} /> Generate script</button>
              <textarea value={script} onChange={(event) => setScript(event.target.value)} placeholder="Your livestream script will appear here..." />
            </SelectionStep>}

            {step === 3 && <SelectionStep title="Design the stream" subtitle="Choose a clean layout for the host, product, offer, and live shopping elements.">
              <div className="layoutGrid">{layouts.map((item) => <button key={item} className={layout === item ? "layoutCard selected" : "layoutCard"} onClick={() => setLayout(item)}><div className="miniStage"><span /><i /><b /></div><strong>{item}</strong></button>)}</div>
            </SelectionStep>}

            {step === 4 && <SelectionStep title="Ready for launch" subtitle="Review the stream package before connecting a broadcasting destination.">
              <div className="launchCard"><div className="launchIcon"><Radio size={26} /></div><div><p>STREAM PACKAGE READY</p><h3>{product.name}</h3><span>{host.name} · {layout}</span></div></div>
              <div className="checkList"><span><Check size={16} /> Product selected</span><span><Check size={16} /> AI host assigned</span><span><Check size={16} /> Sales script prepared</span><span><Check size={16} /> Stream layout configured</span></div>
              <button className="primaryButton full"><Radio size={18} /> Connect Broadcast Destination</button>
            </SelectionStep>}
          </div>

          <footer className="wizardFooter">
            <button className="ghostButton" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}><ChevronLeft size={18} /> Back</button>
            {step < steps.length - 1 && <button className="primaryButton" onClick={next}>Continue <ChevronRight size={18} /></button>}
          </footer>
        </section>
      </section>
    </main>
  );
}

function SelectionStep({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div><div className="contentHeading"><div className="iconBox"><Bot size={21} /></div><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</div>;
}
