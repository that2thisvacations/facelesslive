import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, Gift, ReceiptText, Settings2, ShieldCheck } from "lucide-react";
import { getPlanningRewardPublicConfig } from "@/lib/planning-rewards";
import "./rewards.css";

export default function RewardsPage() {
  const reward = getPlanningRewardPublicConfig();
  return <main className="rewardsManager"><section className="rewardsTitle"><div><p>VACATION REWARDS</p><h1>Convert product buyers<br/><span>into travel clients.</span></h1><div>Manage the bridge between affiliate-product revenue and professional vacation planning.</div></div><Link href="/vacation-planning">Open public reward page <ArrowRight/></Link></section><section className="rewardRuleCard"><div className="rewardRuleHeader"><div><Gift/><span>ACTIVE REWARD</span></div><b>CONFIGURED</b></div><h2>{reward.name}</h2><p>{reward.description}</p><div className="rewardRuleMetrics"><Metric icon={<ReceiptText/>} label="Minimum purchase" value={`$${reward.minimumPurchaseCents / 100}`}/><Metric icon={<Gift/>} label="Planning discount" value={`${reward.discountValue}%`}/><Metric icon={<BadgeCheck/>} label="Maximum savings" value={`$${reward.maximumDiscountCents / 100}`}/><Metric icon={<CalendarDays/>} label="Validity" value={`${reward.validityDays} days`}/></div></section><section className="rewardManagerGrid"><article><ShieldCheck/><h2>Verification gate</h2><p>No reward is issued until a qualifying affiliate order has been verified. One order can create only one reward.</p><span>PROTECTED</span></article><article><Settings2/><h2>Channel-aware delivery</h2><p>TikTok shoppers remain inside TikTok checkout. Reward delivery happens separately after the order is confirmed.</p><span>COMPLIANT</span></article></section></main>;
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <article><div>{icon}</div><span>{label}</span><strong>{value}</strong></article>; }
