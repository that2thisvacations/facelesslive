export type YouTubeChatItem = {
  id?: string;
  snippet?: { displayMessage?: string; type?: string };
  authorDetails?: { displayName?: string };
};

export function normalizeYouTubeChat(items: YouTubeChatItem[]) {
  return items.flatMap((item) => {
    const message = item.snippet?.displayMessage?.trim();
    if (!message || item.snippet?.type !== "textMessageEvent") return [];
    return [{
      externalEventId: item.id || undefined,
      eventType: message.endsWith("?") ? "question" as const : "comment" as const,
      viewerName: item.authorDetails?.displayName || "YouTube viewer",
      message,
    }];
  });
}
