import { NextResponse } from "next/server";
import { getPlanningRewardPublicConfig } from "@/lib/planning-rewards";

export async function GET() {
  return NextResponse.json({ reward: getPlanningRewardPublicConfig() });
}
