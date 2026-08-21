import { BadgeCheck, Boxes, CircleOff, Gift, Layers3, ShieldCheck, Users } from "lucide-react";
import { commercePacks } from "@/lib/commerce-packs";
import "./industries.css";

export default function IndustriesPage() {
  const packs = Object.values(commercePacks);
  return <main className="industriesPage">
    <section className="industriesHero"><div><p>FACELESSLIVE COMMERCE PACKS</p><h1>One engine.<br/><span>Many industries.</span></h1><div>Configure the audience, catalog language, reward, disclosures, and claim boundaries without duplicating the streaming platform.</div></div><aside><Layers3/><strong>{packs.length} packs</strong><span>Travel active • Five templates ready</span></aside></section>
    <section className="industriesPrinciples"><article><Boxes/><strong>Shared engine</strong><span>Avatar, scripts, broadcast controls, analytics, and approvals.</span></article><article><Users/><strong>Separate workspaces</strong><span>Each business keeps its own catalog, customers, voice, and integrations.</span></article><article><ShieldCheck/><strong>Industry guardrails</strong><span>Every pack carries disclosures and restricted-claim rules.</span></article><article><Gift/><strong>Relevant rewards</strong><span>Travel planning for travel; consultations or guides for other industries.</span></article></section>
    <section className="packGrid">{packs.map((pack) => <article className={pack.status === "active" ? "packCard activePack" : "packCard"} key={pack.id}><header><div><span>{pack.status === "active" ? "ACTIVE EDITION" : "CONFIGURATION TEMPLATE"}</span><h2>{pack.name}</h2></div>{pack.status === "active" ? <BadgeCheck/> : <CircleOff/>}</header><p>{pack.promise}</p><small>{pack.audience}</small><div className="categoryList">{pack.categories.map((category) => <b key={category}>{category}</b>)}</div><section><strong>Reward strategy</strong><span>{pack.rewardStrategy}</span></section><section><strong>Required disclosure</strong><span>{pack.requiredDisclosure}</span></section><footer>{pack.restrictedClaims.length} claim restrictions configured</footer></article>)}</section>
    <section className="tenantNotice"><ShieldCheck/><div><h2>Built for controlled multi-business access</h2><p>Templates are not live affiliate channels. Activation will require workspace authentication, tenant-isolated data, an approved product catalog, verified claims, and authorized affiliate credentials.</p></div></section>
  </main>;
}
