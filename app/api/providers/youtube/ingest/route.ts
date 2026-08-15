import { NextResponse } from "next/server";
import { authenticatedOwnerId } from "@/lib/request-owner";
import { findActiveYouTubeBroadcast, getYouTubeAccessToken } from "@/lib/youtube-live";

export async function POST(request: Request) {
  let ownerId: string | null;
  try { ownerId = await authenticatedOwnerId(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication unavailable." }, { status: 503 }); }
  if (!ownerId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const accessToken = await getYouTubeAccessToken(ownerId);
    const active = await findActiveYouTubeBroadcast(accessToken);
    if (!active) return NextResponse.json({ error: "No active YouTube broadcast with live chat was found." }, { status: 404 });
    return NextResponse.json({ ok: true, broadcast: active });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube live discovery failed." }, { status: 502 });
  }
}
