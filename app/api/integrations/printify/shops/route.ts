import { NextResponse } from "next/server";
import { getPrintifyShops } from "@/lib/printify";

export async function GET() {
  try {
    const shops = await getPrintifyShops();
    return NextResponse.json({ shops });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Printify shops." },
      { status: 502 },
    );
  }
}
