"use client";

import { useState } from "react";
import { BadgeCheck, Bot, Building2, Gift, LoaderCircle, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import { commercePacks, type CommercePackId } from "@/lib/commerce-packs";
import type { AvatarStyle, WorkspaceReadiness } from "@/lib/tenant-workspace";
import "./onboarding.css";

const avatars: Array<{ id: AvatarStyle; label: string; detail: string }> = [
  { id: "professional", label: "Professional", detail: "Calm, credible product guide" },
  { id: "educator", label: "Educator", detail: "Teaching-first demonstrations" },
  { id: "energetic", label: "Energetic", detail: "Fast, social selling energy" },
  { id: "luxury", label: "Luxury", detail: "Premium, polished presentation" },
];

export default function OnboardingPage() {
  const [packId, setPackId] = useState<CommercePackId>("travel");
  const [businessName, setBusinessName] = useState("TravelBuddy");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("educator");
  const [rewardName, setRewardName] = useState("Vacation Planning Reward");
  const [rewardDescription, setRewardDescription] = useState("Savings on eligible professional vacation-planning service fees after a verified qualifying purchase.");
  const [readiness, setReadiness] = useState<WorkspaceReadiness | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const pack = commercePacks[packId];

  async function previewWorkspace() {
    setLoading(true);
    setMessage("");
    setReadiness(null);
    try {
      const response = await fetch("/api/workspaces/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessName, packId, avatarStyle, rewardName, rewardDescription }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.join(" ") || result.error || "Unable to preview workspace.");
      setReadiness(result.readiness);
      setMessage(result.notice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to preview workspace.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="onboardingPage">
    <section className="onboardingHero"><p>WORKSPACE ONBOARDING</p><h1>Build your commerce<br/><span>operating profile.</span></h1><div>Create a configuration preview for an industry, AI presenter, and customer reward. Nothing goes live until identity, catalog, affiliate, and channel approvals are complete.</div></section>
    <section className="onboardingLayout"><div className="onboardingForm">
      <fieldset><legend><Building2/> 1. Business identity</legend><label>Business or creator name<input value={businessName} maxLength={80} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business name"/></label></fieldset>
      <fieldset><legend><ShieldCheck/> 2. Commerce Pack</legend><div className="packChoices">{Object.values(commercePacks).map((option) => <button type="button" className={packId === option.id ? "selected" : ""} key={option.id} onClick={() => { setPackId(option.id); setReadiness(null); }}><strong>{option.name}</strong><span>{option.audience}</span><small>{option.status === "active" ? "ACTIVE EDITION" : "TEMPLATE"}</small></button>)}</div></fieldset>
      <fieldset><legend><Bot/> 3. Avatar direction</legend><div className="avatarChoices">{avatars.map((avatar) => <button type="button" className={avatarStyle === avatar.id ? "selected" : ""} key={avatar.id} onClick={() => setAvatarStyle(avatar.id)}><strong>{avatar.label}</strong><span>{avatar.detail}</span></button>)}</div></fieldset>
      <fieldset><legend><Gift/> 4. Customer reward</legend><label>Reward name<input value={rewardName} maxLength={80} onChange={(event) => setRewardName(event.target.value)} placeholder="Optional reward name"/></label><label>Reward description<textarea value={rewardDescription} maxLength={240} onChange={(event) => setRewardDescription(event.target.value)} placeholder="Describe the approved customer benefit"/></label></fieldset>
      <button className="previewWorkspace" type="button" disabled={loading} onClick={previewWorkspace}>{loading ? <LoaderCircle className="spin"/> : <BadgeCheck/>}{loading ? "Checking configuration" : "Preview workspace readiness"}</button>
    </div><aside className="onboardingSummary"><header><span>SELECTED PACK</span><h2>{pack.name}</h2><p>{pack.promise}</p></header><section><strong>Categories</strong><div>{pack.categories.map((category) => <b key={category}>{category}</b>)}</div></section><section><strong>Required disclosure</strong><p>{pack.requiredDisclosure}</p></section><section><strong>Claim restrictions</strong><ul>{pack.restrictedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></section><div className="draftState"><LockKeyhole/><span>Draft only • Nothing published</span></div></aside></section>
    {readiness ? <section className="readinessPanel"><header><BadgeCheck/><div><span>WORKSPACE PREVIEW READY</span><h2>{readiness.workspaceKey}</h2></div></header><div className="readinessColumns"><article><strong>Configured</strong>{readiness.completed.map((item) => <p key={item}><BadgeCheck/>{item}</p>)}</article><article><strong>Required before activation</strong>{readiness.requiredBeforeActivation.map((item) => <p key={item}><PlugZap/>{item}</p>)}</article></div><footer>{message}</footer></section> : message ? <p className="onboardingMessage">{message}</p> : null}
  </main>;
}
