import { NextResponse } from "next/server";
import { commercePacks, defaultCommercePack } from "@/lib/commerce-packs";

export async function GET() {
  return NextResponse.json({
    defaultPackId: defaultCommercePack.id,
    packs: Object.values(commercePacks),
    activationRule: "Template packs require an authenticated workspace, approved catalog, and authorized affiliate connections before launch.",
  });
}
