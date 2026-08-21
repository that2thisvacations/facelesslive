import { NextResponse } from "next/server";
import { channelPolicies, rankTravelProducts } from "@/lib/travel-commerce";

export async function GET(request: Request) {
  const destination = new URL(request.url).searchParams.get("destination")?.trim().toLowerCase();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    destination: destination || null,
    channels: Object.values(channelPolicies),
    products: rankTravelProducts(destination).map(({ product, score }) => ({ ...product, score })),
    notice: "Starter records require authorized affiliate URLs and live price/inventory verification before launch.",
  });
}
