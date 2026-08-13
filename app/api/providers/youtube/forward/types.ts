export type YouTubeForwardResult = {
  ok: true;
  streamJobId: string;
  accepted: number;
  ignored: number;
  nextPageToken: string | null;
  pollingIntervalMillis: number;
  offlineAt: string | null;
};
