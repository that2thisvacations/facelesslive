export type CommerceEventInput = {
  eventType: "impression" | "viewer" | "product_click" | "checkout" | "order" | "commission" | "question" | "policy_block";
  channel?: string;
  valueCents?: number | null;
  quantity?: number | null;
};

export type CustomerJourneyInput = {
  orderId: string;
  channel: string;
  orderValueCents: number;
  rewardStatus?: "not_eligible" | "issued" | "claimed" | "redeemed" | "expired" | "revoked";
  planningStatus?: "none" | "interested" | "qualified" | "consultation" | "booked";
};

export type CommerceInsights = {
  totals: { impressions: number; viewers: number; clicks: number; orders: number; gmvCents: number; commissionCents: number; questions: number; policyBlocks: number };
  rates: { clickThrough: number; orderConversion: number; commissionRate: number };
  channels: Array<{ channel: string; orders: number; gmvCents: number; commissionCents: number }>;
};

export function aggregateCommerceEvents(events: CommerceEventInput[]): CommerceInsights {
  const totals = { impressions: 0, viewers: 0, clicks: 0, orders: 0, gmvCents: 0, commissionCents: 0, questions: 0, policyBlocks: 0 };
  const channels = new Map<string, { orders: number; gmvCents: number; commissionCents: number }>();
  for (const event of events) {
    const amount = Math.max(0, Number(event.valueCents || 0));
    const quantity = Math.max(1, Number(event.quantity || 1));
    if (event.eventType === "impression") totals.impressions += quantity;
    if (event.eventType === "viewer") totals.viewers += quantity;
    if (event.eventType === "product_click") totals.clicks += quantity;
    if (event.eventType === "order") { totals.orders += quantity; totals.gmvCents += amount; }
    if (event.eventType === "commission") totals.commissionCents += amount;
    if (event.eventType === "question") totals.questions += quantity;
    if (event.eventType === "policy_block") totals.policyBlocks += quantity;
    if (event.channel) {
      const row = channels.get(event.channel) || { orders: 0, gmvCents: 0, commissionCents: 0 };
      if (event.eventType === "order") { row.orders += quantity; row.gmvCents += amount; }
      if (event.eventType === "commission") row.commissionCents += amount;
      channels.set(event.channel, row);
    }
  }
  return {
    totals,
    rates: {
      clickThrough: totals.impressions ? totals.clicks / totals.impressions : 0,
      orderConversion: totals.clicks ? totals.orders / totals.clicks : 0,
      commissionRate: totals.gmvCents ? totals.commissionCents / totals.gmvCents : 0,
    },
    channels: [...channels.entries()].map(([channel, values]) => ({ channel, ...values })).sort((a, b) => b.gmvCents - a.gmvCents),
  };
}

export function summarizeCustomerJourney(customers: CustomerJourneyInput[]) {
  return {
    shoppers: customers.length,
    rewardsIssued: customers.filter((customer) => customer.rewardStatus && customer.rewardStatus !== "not_eligible").length,
    planningInterest: customers.filter((customer) => customer.planningStatus && customer.planningStatus !== "none").length,
    qualifiedTravelLeads: customers.filter((customer) => ["qualified", "consultation", "booked"].includes(customer.planningStatus || "")).length,
    bookedClients: customers.filter((customer) => customer.planningStatus === "booked").length,
  };
}
