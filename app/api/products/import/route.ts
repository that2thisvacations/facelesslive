import { NextResponse } from "next/server";

const SUPPORTED_HOSTS = ["tiktok.com", "shopify.com", "amazon.com", "etsy.com"];

function titleFromPath(pathname: string) {
  const slug = pathname.split("/").filter(Boolean).pop() || "Imported Product";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 80);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string };

  if (!body.url) {
    return NextResponse.json({ error: "A product URL is required." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return NextResponse.json({ error: "Enter a valid product URL." }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only HTTP and HTTPS links are supported." }, { status: 400 });
  }

  const hostname = parsed.hostname.replace(/^www\./, "");
  const supported = SUPPORTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

  return NextResponse.json({
    product: {
      id: `imported-${Date.now()}`,
      name: titleFromPath(parsed.pathname),
      price: "Price pending",
      detail: `Imported from ${hostname}`,
      sourceUrl: parsed.toString(),
      source: hostname,
      status: supported ? "ready" : "review_required",
    },
    note: supported
      ? "Product link accepted. Live catalog enrichment will run after the commerce connector is authorized."
      : "The link was saved, but this storefront requires manual review before enrichment.",
  });
}
