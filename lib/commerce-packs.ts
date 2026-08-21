export type CommercePackId = "travel" | "beauty" | "home" | "fitness" | "creator" | "business";

export type CommercePack = {
  id: CommercePackId;
  name: string;
  audience: string;
  promise: string;
  categories: string[];
  rewardStrategy: string;
  requiredDisclosure: string;
  restrictedClaims: string[];
  status: "active" | "template";
};

export const commercePacks: Record<CommercePackId, CommercePack> = {
  travel: { id: "travel", name: "TravelBuddy Commerce", audience: "Travel advisors, creators, and destination brands", promise: "Turn travel-product shoppers into vacation-planning relationships.", categories: ["Packing", "Airport essentials", "Travel technology", "Safety", "Documents"], rewardStrategy: "Eligible verified purchases may unlock vacation-planning savings.", requiredDisclosure: "Affiliate links may generate a commission. Travel terms and supplier pricing must be verified.", restrictedClaims: ["Guaranteed savings", "Guaranteed safety", "Unverified supplier terms"], status: "active" },
  beauty: { id: "beauty", name: "Beauty Commerce", audience: "Beauty creators, salons, and wellness educators", promise: "Demonstrate approved beauty products through a consistent AI presenter.", categories: ["Skincare", "Cosmetics", "Hair care", "Tools", "Wellness"], rewardStrategy: "Eligible purchases may unlock a consultation or approved store offer.", requiredDisclosure: "Affiliate links may generate a commission. Results vary by person.", restrictedClaims: ["Medical outcomes", "Guaranteed results", "Before-and-after fabrication"], status: "template" },
  home: { id: "home", name: "Home Commerce", audience: "Home organizers, decorators, and product educators", promise: "Show practical products through problem-and-solution demonstrations.", categories: ["Kitchen", "Organization", "Decor", "Cleaning", "Smart home"], rewardStrategy: "Eligible purchases may unlock a consultation or curated guide.", requiredDisclosure: "Affiliate links may generate a commission. Verify specifications before purchase.", restrictedClaims: ["Unsupported safety claims", "Invented dimensions", "Unverified compatibility"], status: "template" },
  fitness: { id: "fitness", name: "Fitness Commerce", audience: "Coaches, fitness creators, and wellness communities", promise: "Present approved fitness products without unsafe performance promises.", categories: ["Equipment", "Apparel", "Recovery", "Hydration", "Accessories"], rewardStrategy: "Eligible purchases may unlock an educational session or approved challenge.", requiredDisclosure: "Affiliate links may generate a commission. Content is not medical advice.", restrictedClaims: ["Medical claims", "Guaranteed weight loss", "Guaranteed performance"], status: "template" },
  creator: { id: "creator", name: "Creator Commerce", audience: "Creators, streamers, educators, and production studios", promise: "Explain creator tools with repeatable demos and verified specifications.", categories: ["Cameras", "Audio", "Lighting", "Software", "Accessories"], rewardStrategy: "Eligible purchases may unlock a setup guide or workflow review.", requiredDisclosure: "Affiliate links may generate a commission. Software pricing can change.", restrictedClaims: ["Guaranteed income", "Invented benchmarks", "Unverified compatibility"], status: "template" },
  business: { id: "business", name: "Business Commerce", audience: "Entrepreneurs, mentors, and small-business educators", promise: "Connect useful business products to guided education and services.", categories: ["Office", "Software", "Education", "Productivity", "Services"], rewardStrategy: "Eligible purchases may unlock an onboarding or strategy session.", requiredDisclosure: "Affiliate links may generate a commission. No income outcome is guaranteed.", restrictedClaims: ["Guaranteed earnings", "Misleading scarcity", "Unverified ROI"], status: "template" },
};

export const defaultCommercePack = commercePacks.travel;

export function getCommercePack(packId?: string | null) {
  if (!packId) return defaultCommercePack;
  return commercePacks[packId as CommercePackId] || defaultCommercePack;
}
