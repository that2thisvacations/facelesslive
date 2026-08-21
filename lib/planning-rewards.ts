export type PlanningReward = {
  id: string;
  name: string;
  description: string;
  minimumPurchaseCents: number;
  discountType: "percent" | "fixed";
  discountValue: number;
  maximumDiscountCents: number;
  validityDays: number;
  eligibleChannels: string[];
  redemptionMode: "post_purchase";
};

export const starterPlanningReward: PlanningReward = {
  id: "travel-shopper-planning-reward",
  name: "Travel Shopper Planning Reward",
  description: "A verified qualifying travel-product purchase unlocks a discount on professional vacation-planning services.",
  minimumPurchaseCents: 5000,
  discountType: "percent",
  discountValue: 15,
  maximumDiscountCents: 7500,
  validityDays: 30,
  eligibleChannels: ["owned_web", "youtube", "tiktok_shop", "amazon", "meta", "pinterest"],
  redemptionMode: "post_purchase",
};

export function planningRewardFromEnvironment(): PlanningReward {
  const percent = Number(process.env.VACATION_PLANNING_DISCOUNT_PERCENT || starterPlanningReward.discountValue);
  const minimumDollars = Number(process.env.VACATION_PLANNING_MINIMUM_PURCHASE || starterPlanningReward.minimumPurchaseCents / 100);
  const maximumDollars = Number(process.env.VACATION_PLANNING_MAXIMUM_DISCOUNT || starterPlanningReward.maximumDiscountCents / 100);
  const validityDays = Number(process.env.VACATION_PLANNING_REWARD_VALIDITY_DAYS || starterPlanningReward.validityDays);
  return {
    ...starterPlanningReward,
    discountValue: Math.min(50, Math.max(1, Number.isFinite(percent) ? percent : 15)),
    minimumPurchaseCents: Math.max(0, Math.round((Number.isFinite(minimumDollars) ? minimumDollars : 50) * 100)),
    maximumDiscountCents: Math.max(0, Math.round((Number.isFinite(maximumDollars) ? maximumDollars : 75) * 100)),
    validityDays: Math.min(365, Math.max(1, Math.round(Number.isFinite(validityDays) ? validityDays : 30))),
  };
}

export function getPlanningRewardPublicConfig() {
  const reward = planningRewardFromEnvironment();
  return {
    name: reward.name,
    description: reward.description,
    minimumPurchaseCents: reward.minimumPurchaseCents,
    discountType: reward.discountType,
    discountValue: reward.discountValue,
    maximumDiscountCents: reward.maximumDiscountCents,
    validityDays: reward.validityDays,
    terms: [
      "A qualifying purchase must be verified before a reward is issued.",
      "One reward may be issued per verified order and used once.",
      "The reward applies to eligible vacation-planning service fees, not supplier prices, taxes, airfare, hotels, cruises, or other travel components.",
      "Rewards have no cash value and cannot be combined unless expressly allowed.",
      "TikTok Shop viewers complete their purchase inside TikTok; reward delivery occurs separately after purchase verification.",
    ],
  };
}
