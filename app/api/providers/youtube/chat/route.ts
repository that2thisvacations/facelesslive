import { NextResponse } from "next/server";
import { getYouTubeAccessToken } from "@/lib/youtube-live";

type ChatMessage = { id?: string; snippet?: { displayMessage?: string; type?: string }; authorDetails?: { displayName?: string } };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerId = request.headers.get("x-facelesslive-owner")?.trim();
  const liveChatId = url.searchParams.get("liveChatId")?.trim();
  if (!ownerId || !liveChatId) return NextResponse.json({ error: "Owner context and liveChatId are required." }, { status: 400 });
  try {
    const accessToken = await getYouTubeAccessToken(ownerId);
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    endpoint.searchParams.set("part", "id,snippet,authorDetails");
    endpoint.searchParams.set("liveChatId", liveChatId);
    endpoint.searchParams.set("maxResults", "200");
    const pageToken = url.searchParams.get("pageToken");
    if (pageToken) endpoint.searchParams.set("pageToken", pageToken);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const data = await response.json() as { items?: ChatMessage[]; nextPageToken?: string; pollingIntervalMillis?: number; offlineAt?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Unable to read YouTube live chat.");
    const messages = (data.items || []).filter((item) => item.snippet?.type === "textMessageEvent" && item.snippet.displayMessage?.trim()).map((item) => ({ id: item.id, message: item.snippet?.displayMessage?.trim(), viewerName: item.authorDetails?.displayName || "YouTube viewer" }));
    return NextResponse.json({ ok: true, messages, nextPageToken: data.nextPageToken || null, pollingIntervalMillis: data.pollingIntervalMillis || 5000, offlineAt: data.offlineAt || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube live chat failed." }, { status: 502 });
  }
}
