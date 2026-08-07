import { NextResponse } from "next/server";

type SceneRequest = {
  productName?: string;
  layout?: string;
  offerText?: string;
  cta?: string;
};

export async function POST(request: Request) {
  let body: SceneRequest;
  try {
    body = (await request.json()) as SceneRequest;
  } catch {
    return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
  }

  const productName = body.productName?.trim();
  if (!productName) return NextResponse.json({ error: "A product name is required." }, { status: 400 });

  const offerText = body.offerText?.trim() || "Featured live offer";
  const cta = body.cta?.trim() || "Tap the product card to shop now";
  const layout = body.layout?.trim() || "Host + Product";

  return NextResponse.json({
    plan: {
      version: 1,
      layout,
      scenes: [
        { id: "hook", start: 0, end: 12, title: productName, subtitle: "Watch this before you scroll", position: "lower-third" },
        { id: "benefit", start: 12, end: 34, title: productName, subtitle: "See the product in action", position: "lower-third" },
        { id: "offer", start: 34, end: 50, title: offerText, subtitle: productName, position: "lower-third" },
        { id: "cta", start: 50, end: 60, title: cta, subtitle: productName, position: "lower-third" },
      ],
    },
  });
}
