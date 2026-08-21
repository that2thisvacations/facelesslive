import { NextResponse } from "next/server";
import {
  buildCommercePlan,
  channelPolicies,
  getNextCommercePlan,
  travelProductCatalog,
  type CommerceChannelId,
} from "@/lib/travel-commerce";

type PlanRequest = {
  channel?: string;
  productId?: string;
  destination?: string;
  requestAutoLaunch?: boolean;
};

function isChannel(value: string): value is CommerceChannelId {
  return value in channelPolicies;
}

export async function POST(request: Request) {
  let body: PlanRequest;
  try { body = (await request.json()) as PlanRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const channelId = body.channel?.trim() || "owned_web";
  if (!isChannel(channelId)) return NextResponse.json({ error: "Unsupported commerce channel." }, { status: 400 });

  const product = body.productId
    ? travelProductCatalog.find((item) => item.id === body.productId)
    : undefined;
  if (body.productId && !product) return NextResponse.json({ error: "Unknown travel product." }, { status: 404 });

  const plan = product
    ? buildCommercePlan(product, channelId)
    : getNextCommercePlan(channelId, body.destination?.trim().toLowerCase());

  if (body.requestAutoLaunch && !plan.canAutoLaunch) {
    return NextResponse.json({
      error: "Autonomous launch is blocked by channel policy.",
      decision: "HUMAN_SUPERVISION_REQUIRED",
      plan,
    }, { status: 409 });
  }

  if (body.requestAutoLaunch && (!plan.product.affiliateUrl || plan.product.inventoryStatus !== "in_stock")) {
    return NextResponse.json({
      error: "Autonomous launch requires a verified affiliate URL and current inventory.",
      decision: "COMMERCE_EVIDENCE_INCOMPLETE",
      plan,
    }, { status: 409 });
  }

  return NextResponse.json({
    decision: plan.canAutoLaunch ? "AUTONOMOUS_ELIGIBLE" : "SUPERVISED_OR_CONTENT_ONLY",
    plan,
  });
}
