"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Boxes, Gift, Layers3, LayoutDashboard, Radio, UserPlus, Users } from "lucide-react";

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
  return <header className="unifiedNav">
    <Link className="unifiedBrand" href="/dashboard"><span>F</span><div><strong>FacelessLive AI™</strong><small>Travel Commerce Network</small></div></Link>
    <nav>{operatorLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={16}/><span>{label}</span></Link>)}</nav>
    <div className="operatorBadge"><Bot size={17}/><div><strong>FOUNDER</strong><small>Operator workspace</small></div></div>
  </header>;
}
