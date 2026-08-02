import { NextResponse } from "next/server";

type GenerateRequest = {
  productName?: string;
  productPrice?: string;
  hostStyle?: string;
  tone?: "educational" | "energetic" | "demonstration";
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const productName = body.productName?.trim();

  if (!productName) {
    return NextResponse.json({ error: "A product name is required." }, { status: 400 });
  }

  const price = body.productPrice?.trim() || "today's featured price";
  const hostStyle = body.hostStyle?.trim() || "confident product expert";
  const tone = body.tone || "energetic";

  const openings = {
    educational: `Here is why the ${productName} deserves a closer look.`,
    energetic: `Stop scrolling. The ${productName} is today's featured find.`,
    demonstration: `Watch what happens when we put the ${productName} to work.`,
  };

  const script = `${openings[tone]} Your ${hostStyle.toLowerCase()} will show the problem it solves, demonstrate the most useful feature, answer the questions buyers usually ask, and explain why ${price} delivers strong value. Keep watching for the live offer, then tap the product card before the featured promotion ends.`;

  return NextResponse.json({
    script,
    generatedAt: new Date().toISOString(),
    source: "facelesslive-template-engine",
  });
}
