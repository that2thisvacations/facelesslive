export type YouTubeIngestionCursor = {
  broadcastId: string;
  liveChatId: string;
  nextPageToken: string | null;
  pollingIntervalMillis: number;
  updatedAt: string;
};

export function nextYouTubeCursor(broadcastId: string, liveChatId: string, nextPageToken: string | null, pollingIntervalMillis: number): YouTubeIngestionCursor {
  return { broadcastId, liveChatId, nextPageToken, pollingIntervalMillis: Math.max(1000, pollingIntervalMillis), updatedAt: new Date().toISOString() };
}
