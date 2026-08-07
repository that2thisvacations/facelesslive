import { NextResponse } from "next/server";
import { getPrintifyProducts } from "@/lib/printify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopId = Number(searchParams.get("shopId"));

  if (!Number.isInteger(shopId) || shopId <= 0) {
    return NextResponse.json({ error: "A valid Printify shopId is required." }, { status: 400 });
  }

  try {
    const products = await getPrintifyProducts(shopId);
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Printify products." },
      { status: 502 },
    );
  }
}
