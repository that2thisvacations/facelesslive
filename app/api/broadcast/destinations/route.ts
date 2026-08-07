import { NextResponse } from "next/server";
import { broadcastDestinations } from "@/lib/broadcast-destinations";

export async function GET() {
  return NextResponse.json({ destinations: broadcastDestinations });
}
