export type YouTubeChatCursor = {
  nextPageToken: string | null;
  pollingIntervalMillis: number;
  offlineAt: string | null;
};

export type NormalizedYouTubeMessage = {
  id?: string;
  message: string;
  viewerName: string;
};
