"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Boxes, ChevronRight, Gift, Layers3, LayoutDashboard, Radio, ShieldCheck, UserPlus, Users } from "lucide-react";

const operatorLinks = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/", label: "Live Studio", icon: Radio },
  { href: "/commerce", label: "Products", icon: Boxes },
  { href: "/industries", label: "Commerce Packs", icon: Layers3 },
  { href: "/onboarding", label: "Workspace Setup", icon: UserPlus },
  { href: "/rewards", label: "Vacation Rewards", icon: Gift },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function AppNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/vacation-planning")) {
    return <header className="publicNav"><Link className="unifiedBrand" href="/vacation-planning"><span>F</span><div><strong>FacelessLive</strong><small>Powered by TravelBuddy OS™</small></div></Link><Link className="publicNavLink" href="/">Creator Studio</Link></header>;
  }
  return <aside className="unifiedNav">
    <Link className="unifiedBrand" href="/dashboard"><span>FL</span><div><strong>FacelessLive AI™</strong><small>Powered by TravelBuddy OS™</small></div></Link>
    <div className="navEdition"><div><Radio size={15}/><span>TRAVEL COMMERCE</span></div><strong>Operator Suite</strong><small>AI-assisted selling workspace</small></div>
    <nav><span className="navLabel">WORKSPACES</span>{operatorLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={17}/><span>{label}</span><ChevronRight className="navArrow" size={14}/></Link>)}</nav>
    <div className="navTrust"><ShieldCheck size={17}/><div><strong>Governed automation</strong><small>Affiliate and channel gates active</small></div></div>
    <div className="operatorBadge"><Bot size={18}/><div><strong>FOUNDER ACCESS</strong><small>Duane “TravelBuddy” Maclin</small></div><i/></div>
  </aside>;
}
