const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyFailure(status, body) {
  const reason = body?.error?.errors?.[0]?.reason || "";
  if (reason === "liveChatEnded") return "ended";
  if (reason === "liveChatDisabled") return "disabled";
  if (reason === "rateLimitExceeded" || status === 429) return "rate_limited";
  if (status === 401) return "reauthorize";
  return "provider_error";
}

export async function runYouTubeChatConsumer({ liveChatId, accessToken, onMessages, signal, initialPageToken = null, maxReconnects = 8 }) {
  let pageToken = initialPageToken;
  let reconnects = 0;
  let delay = 1000;

  while (!signal?.aborted) {
    const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    url.searchParams.set("part", "id,snippet,authorDetails");
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
      const body = await response.json();
      if (!response.ok) {
        const kind = classifyFailure(response.status, body);
        if (["ended", "disabled", "reauthorize"].includes(kind)) return { status: kind, pageToken };
        throw new Error(body?.error?.message || kind);
      }

      reconnects = 0;
      delay = 1000;
      pageToken = body.nextPageToken || pageToken;
      if (Array.isArray(body.items) && body.items.length) await onMessages(body.items, pageToken);
      if (body.offlineAt) return { status: "ended", pageToken, offlineAt: body.offlineAt };
      await sleep(Math.max(1000, Number(body.pollingIntervalMillis || 5000)));
    } catch (error) {
      if (signal?.aborted) return { status: "stopped", pageToken };
      reconnects += 1;
      if (reconnects > maxReconnects) throw error;
      await sleep(delay);
      delay = Math.min(delay * 2, 30000);
    }
  }

  return { status: "stopped", pageToken };
}
