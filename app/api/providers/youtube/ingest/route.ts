import { NextResponse } from "next/server";
import { findActiveYouTubeBroadcast, getYouTubeAccessToken } from "@/lib/youtube-live";

export async function POST(request: Request) {
  const ownerId = request.headers.get("x-facelesslive-owner")?.trim();
  if (!ownerId) return NextResponse.json({ error: "Owner context required." }, { status: 401 });
  try {
    const accessToken = await getYouTubeAccessToken(ownerId);
    const active = await findActiveYouTubeBroadcast(accessToken);
    if (!active) return NextResponse.json({ error: "No active YouTube broadcast with live chat was found." }, { status: 404 });
    return NextResponse.json({ ok: true, broadcast: active });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube live discovery failed." }, { status: 502 });
  }
}
