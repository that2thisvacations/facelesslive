export type CommerceChannelId =
  | "owned_web"
  | "youtube"
  | "tiktok_shop"
  | "amazon"
  | "meta"
  | "pinterest";

export type AutomationMode = "autonomous" | "supervised" | "content_only" | "disabled";

export type AffiliateProduct = {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  commissionRate: number;
  destinationTags: string[];
  problemSolved: string;
  proofPoints: string[];
  disclosure: string;
  inventoryStatus: "in_stock" | "low" | "unknown";
  rating?: number;
  conversionRate?: number;
  affiliateUrl?: string;
  imageUrl?: string;
};

export type ChannelPolicy = {
  id: CommerceChannelId;
  name: string;
  mode: AutomationMode;
  permitsUnattendedAvatar: boolean;
  permitsAiVoice: boolean;
  requiresHumanPresence: boolean;
  requiresNativeCheckout: boolean;
  maxSessionMinutes: number | null;
  disclosure: string;
};

export type SalesBlock = {
  type: "hook" | "problem" | "demonstration" | "proof" | "offer" | "question" | "cross_sell";
  durationSeconds: number;
  instruction: string;
};

export type CommercePlan = {
  channel: ChannelPolicy;
  product: AffiliateProduct;
  score: number;
  projectedCommissionCents: number;
  canAutoLaunch: boolean;
  requiresApproval: boolean;
  blocks: SalesBlock[];
  guardrails: string[];
};

export const channelPolicies: Record<CommerceChannelId, ChannelPolicy> = {
  owned_web: {
    id: "owned_web",
    name: "TravelBuddy Live Shopping Network",
    mode: "autonomous",
    permitsUnattendedAvatar: true,
    permitsAiVoice: true,
    requiresHumanPresence: false,
    requiresNativeCheckout: false,
    maxSessionMinutes: null,
    disclosure: "AI-hosted shopping presentation. Affiliate links may generate a commission.",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    mode: "supervised",
    permitsUnattendedAvatar: false,
    permitsAiVoice: true,
    requiresHumanPresence: true,
    requiresNativeCheckout: false,
    maxSessionMinutes: 240,
    disclosure: "AI-assisted presentation with live human oversight. Affiliate links may generate a commission.",
  },
  tiktok_shop: {
    id: "tiktok_shop",
    name: "TikTok Shop",
    mode: "supervised",
    permitsUnattendedAvatar: false,
    permitsAiVoice: false,
    requiresHumanPresence: true,
    requiresNativeCheckout: true,
    maxSessionMinutes: 120,
    disclosure: "TikTok Shop affiliate promotion. Creator may earn commission from purchases.",
  },
  amazon: {
    id: "amazon",
    name: "Amazon Affiliate Content",
    mode: "content_only",
    permitsUnattendedAvatar: false,
    permitsAiVoice: true,
    requiresHumanPresence: false,
    requiresNativeCheckout: false,
    maxSessionMinutes: null,
    disclosure: "As an Amazon Associate, the publisher may earn from qualifying purchases.",
  },
  meta: {
    id: "meta",
    name: "Facebook and Instagram",
    mode: "supervised",
    permitsUnattendedAvatar: false,
    permitsAiVoice: true,
    requiresHumanPresence: true,
    requiresNativeCheckout: false,
    maxSessionMinutes: 240,
    disclosure: "AI-assisted affiliate presentation. Purchases may generate a commission.",
  },
  pinterest: {
    id: "pinterest",
    name: "Pinterest",
    mode: "content_only",
    permitsUnattendedAvatar: false,
    permitsAiVoice: true,
    requiresHumanPresence: false,
    requiresNativeCheckout: false,
    maxSessionMinutes: null,
    disclosure: "Affiliate link: the publisher may earn a commission from qualifying purchases.",
  },
};

export const travelProductCatalog: AffiliateProduct[] = [
  {
    id: "carry-on-organizer",
    name: "Compression Packing Cube Set",
    category: "Packing",
    priceCents: 2999,
    commissionRate: 0.1,
    destinationTags: ["cruise", "flight", "weekend", "family"],
    problemSolved: "Fit more clothing into a carry-on while keeping outfits organized.",
    proofPoints: ["Compression zipper", "Multiple sizes", "Reusable organization system"],
    disclosure: "Affiliate product; verify current price, inventory, and commission before publishing.",
    inventoryStatus: "unknown",
    rating: 4.6,
    conversionRate: 0.047,
  },
  {
    id: "universal-adapter",
    name: "Universal Travel Power Adapter",
    category: "International Travel",
    priceCents: 3499,
    commissionRate: 0.08,
    destinationTags: ["international", "business", "europe", "asia"],
    problemSolved: "Charge common devices across multiple outlet standards.",
    proofPoints: ["Multiple plug standards", "USB charging", "Compact travel form"],
    disclosure: "Affiliate product; confirm destination compatibility and device wattage limitations.",
    inventoryStatus: "unknown",
    rating: 4.5,
    conversionRate: 0.04,
  },
  {
    id: "luggage-scale",
    name: "Digital Luggage Scale",
    category: "Airport Essentials",
    priceCents: 1499,
    commissionRate: 0.12,
    destinationTags: ["flight", "cruise", "international", "family"],
    problemSolved: "Check bag weight before reaching the airline counter.",
    proofPoints: ["Portable", "Easy-to-read display", "Designed for suitcase handles"],
    disclosure: "Affiliate product; airline weight limits and fees vary.",
    inventoryStatus: "unknown",
    rating: 4.7,
    conversionRate: 0.061,
  },
  {
    id: "portable-charger",
    name: "Travel Power Bank",
    category: "Travel Technology",
    priceCents: 3999,
    commissionRate: 0.09,
    destinationTags: ["flight", "road-trip", "cruise", "business"],
    problemSolved: "Keep mobile devices powered while navigating, translating, and traveling.",
    proofPoints: ["Portable charging", "Multiple-device support", "Travel-ready capacity"],
    disclosure: "Affiliate product; verify airline battery rules and current product specifications.",
    inventoryStatus: "unknown",
    rating: 4.6,
    conversionRate: 0.052,
  },
  {
    id: "anti-theft-bag",
    name: "Anti-Theft Crossbody Travel Bag",
    category: "Travel Security",
    priceCents: 4599,
    commissionRate: 0.11,
    destinationTags: ["city", "international", "cruise", "solo"],
    problemSolved: "Keep travel essentials organized and closer to the body in busy destinations.",
    proofPoints: ["Close-body design", "Organized compartments", "Hands-free carrying"],
    disclosure: "Affiliate product; no bag can guarantee prevention of theft.",
    inventoryStatus: "unknown",
    rating: 4.4,
    conversionRate: 0.038,
  },
  {
    id: "passport-organizer",
    name: "Family Passport and Document Organizer",
    category: "Travel Documents",
    priceCents: 2299,
    commissionRate: 0.1,
    destinationTags: ["family", "international", "cruise", "flight"],
    problemSolved: "Keep passports, boarding documents, and cards together during group travel.",
    proofPoints: ["Multi-document storage", "Zippered closure", "Family travel organization"],
    disclosure: "Affiliate product; travelers remain responsible for securing identity documents.",
    inventoryStatus: "unknown",
    rating: 4.7,
    conversionRate: 0.055,
  },
];

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function scoreAffiliateProduct(product: AffiliateProduct, destinationTag?: string) {
  const ratingScore = ((product.rating ?? 3.5) / 5) * 30;
  const conversionScore = clamp((product.conversionRate ?? 0) * 500, 0, 25);
  const commissionScore = clamp(product.commissionRate * 200, 0, 20);
  const travelFit = destinationTag
    ? product.destinationTags.includes(destinationTag.toLowerCase()) ? 25 : 5
    : 15;
  const inventoryPenalty = product.inventoryStatus === "low" ? 15 : product.inventoryStatus === "unknown" ? 5 : 0;
  return Math.round(clamp(ratingScore + conversionScore + commissionScore + travelFit - inventoryPenalty));
}

export function rankTravelProducts(destinationTag?: string) {
  return travelProductCatalog
    .map((product) => ({ product, score: scoreAffiliateProduct(product, destinationTag) }))
    .sort((left, right) => right.score - left.score);
}

export function buildCommercePlan(product: AffiliateProduct, channelId: CommerceChannelId): CommercePlan {
  const channel = channelPolicies[channelId];
  const score = scoreAffiliateProduct(product);
  const canAutoLaunch = channel.mode === "autonomous" && channel.permitsUnattendedAvatar;
  return {
    channel,
    product,
    score,
    projectedCommissionCents: Math.round(product.priceCents * product.commissionRate),
    canAutoLaunch,
    requiresApproval: !canAutoLaunch,
    blocks: [
      { type: "hook", durationSeconds: 12, instruction: `Open with a real travel scenario where ${product.name} becomes useful.` },
      { type: "problem", durationSeconds: 18, instruction: product.problemSolved },
      { type: "demonstration", durationSeconds: 40, instruction: `Demonstrate only verified features: ${product.proofPoints.join(", ")}.` },
      { type: "proof", durationSeconds: 20, instruction: "State verified product details without guarantees or exaggerated claims." },
      { type: "offer", durationSeconds: 15, instruction: "Use the current authorized price and affiliate destination at presentation time." },
      { type: "question", durationSeconds: 30, instruction: "Answer viewer questions only from verified catalog facts; escalate unknowns." },
      { type: "cross_sell", durationSeconds: 20, instruction: "Transition to one complementary travel product without pressure." },
    ],
    guardrails: [
      product.disclosure,
      channel.disclosure,
      "Never invent price, availability, shipping, safety, warranty, or performance claims.",
      "Do not launch when the affiliate URL, authorization, price, or inventory is unverified.",
      ...(channelId === "tiktok_shop" ? [
        "Human presence and real-time interaction are mandatory.",
        "AI voice and unattended avatar mode are disabled.",
        "Keep checkout and product promotion inside TikTok Shop.",
      ] : []),
    ],
  };
}

export function getNextCommercePlan(channelId: CommerceChannelId, destinationTag?: string) {
  const [ranked] = rankTravelProducts(destinationTag);
  return buildCommercePlan(ranked.product, channelId);
}
