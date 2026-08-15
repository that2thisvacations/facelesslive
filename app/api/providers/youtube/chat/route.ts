import { NextResponse } from "next/server";
import { authenticatedOwnerId } from "@/lib/request-owner";
import { getYouTubeAccessToken } from "@/lib/youtube-live";
import { normalizeYouTubeChat, type YouTubeChatItem } from "@/lib/youtube-chat-normalize";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let ownerId: string | null;
  try { ownerId = await authenticatedOwnerId(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication unavailable." }, { status: 503 }); }
  const liveChatId = url.searchParams.get("liveChatId")?.trim();
  if (!ownerId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!liveChatId) return NextResponse.json({ error: "liveChatId is required." }, { status: 400 });
  try {
    const accessToken = await getYouTubeAccessToken(ownerId);
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    endpoint.searchParams.set("part", "id,snippet,authorDetails");
    endpoint.searchParams.set("liveChatId", liveChatId);
    endpoint.searchParams.set("maxResults", "200");
    const pageToken = url.searchParams.get("pageToken");
    if (pageToken) endpoint.searchParams.set("pageToken", pageToken);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const data = await response.json() as { items?: YouTubeChatItem[]; nextPageToken?: string; pollingIntervalMillis?: number; offlineAt?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Unable to read YouTube live chat.");
    return NextResponse.json({ ok: true, messages: normalizeYouTubeChat(data.items || []), nextPageToken: data.nextPageToken || null, pollingIntervalMillis: data.pollingIntervalMillis || 5000, offlineAt: data.offlineAt || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube live chat failed." }, { status: 502 });
  }
}
