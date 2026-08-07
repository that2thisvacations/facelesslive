import { NextResponse } from "next/server";

type GenerateRequest = {
  productName?: string;
  productPrice?: string;
  hostStyle?: string;
  tone?: "educational" | "energetic" | "demonstration";
};

function fallbackScript(productName: string, price: string, hostStyle: string, tone: GenerateRequest["tone"]) {
  const openings = {
    educational: `Here is why the ${productName} deserves a closer look.`,
    energetic: `Stop scrolling. The ${productName} is today's featured find.`,
    demonstration: `Watch what happens when we put the ${productName} to work.`,
  };
  return `${openings[tone || "energetic"]} Your ${hostStyle.toLowerCase()} will show the problem it solves, demonstrate the most useful feature, answer the questions buyers usually ask, and explain why ${price} delivers strong value. Keep watching for the live offer, then tap the product card before the featured promotion ends.`;
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
  }

  const productName = body.productName?.trim();
  if (!productName) return NextResponse.json({ error: "A product name is required." }, { status: 400 });

  const price = body.productPrice?.trim() || "today's featured price";
  const hostStyle = body.hostStyle?.trim() || "confident product expert";
  const tone = body.tone || "energetic";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      script: fallbackScript(productName, price, hostStyle, tone),
      generatedAt: new Date().toISOString(),
      source: "facelesslive-template-fallback",
    });
  }

  const prompt = [
    "Write a concise live-commerce sales script for a faceless AI presenter.",
    `Product: ${productName}`,
    `Price: ${price}`,
    `Presenter style: ${hostStyle}`,
    `Tone: ${tone}`,
    "Structure: hook, problem, product benefit, short demonstration language, one FAQ/objection response, and a clear call to action.",
    "Do not invent certifications, reviews, discounts, scarcity, shipping terms, or product claims that were not provided.",
    "Keep it natural for spoken delivery and under 170 words.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", input: prompt }),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
    const data = (await response.json()) as { output_text?: string };
    const script = data.output_text?.trim();
    if (!script) throw new Error("OpenAI returned no script text.");

    return NextResponse.json({ script, generatedAt: new Date().toISOString(), source: "openai-responses" });
  } catch {
    return NextResponse.json({
      script: fallbackScript(productName, price, hostStyle, tone),
      generatedAt: new Date().toISOString(),
      source: "facelesslive-template-fallback",
      warning: "AI generation was unavailable, so a safe fallback script was used.",
    });
  }
}
