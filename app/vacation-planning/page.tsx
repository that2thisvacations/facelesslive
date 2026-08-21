import { ArrowRight, BadgeCheck, Gift, Plane, ShieldCheck, ShoppingBag } from "lucide-react";
import { getPlanningRewardPublicConfig } from "@/lib/planning-rewards";
import "./vacation-planning.css";

export default function VacationPlanningRewardPage() {
  const reward = getPlanningRewardPublicConfig();
  const minimum = `$${(reward.minimumPurchaseCents / 100).toFixed(0)}`;
  const maximum = `$${(reward.maximumDiscountCents / 100).toFixed(0)}`;
  return <main className="rewardPage">
    <header className="rewardHeader"><a href="/"><span>F</span>FacelessLive</a><a className="commandLink" href="/commerce">Commerce Command Center</a></header>
    <section className="rewardHero">
      <div className="rewardCopy"><p>TRAVELBUDDY SHOPPER BENEFIT</p><h1>Shop smarter.<br/><span>Plan your vacation for less.</span></h1><div className="rewardLead">Purchase qualifying travel essentials through an authorized FacelessLive affiliate presentation and unlock a professional vacation-planning reward after your order is verified.</div><a className="rewardCta" href="#how-it-works">See how it works <ArrowRight/></a></div>
      <div className="offerCard"><Gift/><span>VACATION-PLANNING REWARD</span><strong>{reward.discountValue}% OFF</strong><p>Eligible planning-service fees</p><small>Up to {maximum} · Valid for {reward.validityDays} days</small></div>
    </section>
    <section id="how-it-works" className="rewardSteps">
      <article><ShoppingBag/><b>01</b><h2>Shop travel essentials</h2><p>Complete at least {minimum} in qualifying purchases through an approved affiliate channel.</p></article>
      <article><BadgeCheck/><b>02</b><h2>Order gets verified</h2><p>The commerce engine confirms the authorized channel, qualifying order, and reward eligibility.</p></article>
      <article><Plane/><b>03</b><h2>Plan the next trip</h2><p>Use the single-use reward toward eligible professional vacation-planning service fees.</p></article>
    </section>
    <section className="rewardTerms"><ShieldCheck/><div><h2>Transparent by design</h2>{reward.terms.map((term) => <p key={term}>{term}</p>)}</div></section>
    <footer className="rewardFooter"><strong>Powered by TravelBuddy OS™</strong><span>Shopper rewards are issued only after verified qualifying purchases.</span></footer>
  </main>;
}
