function abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      resolve(false);
    };
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function classifyFailure(status, body) {
  const reason = body?.error?.errors?.[0]?.reason || "";
  if (reason === "liveChatEnded") return "ended";
  if (reason === "liveChatDisabled") return "disabled";
  if (reason === "rateLimitExceeded" || status === 429) return "rate_limited";
  if (status === 401) return "reauthorize";
  return "provider_error";
}

function isAuthorizationError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /reconnect|reauthoriz|authorization/i.test(message);
}

export async function runYouTubeChatConsumer({ liveChatId, accessToken, refreshAccessToken, onMessages, onStatus, signal, initialPageToken = null, maxReconnects = 8 }) {
  let pageToken = initialPageToken;
  let currentAccessToken = accessToken;
  let reconnects = 0;
  let delay = 1000;
  let providerDelay = 5000;
  let authRefreshes = 0;

  onStatus?.({ status: "starting", pageToken });

  while (!signal?.aborted) {
    const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    url.searchParams.set("part", "id,snippet,authorDetails");
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${currentAccessToken}` }, signal });
      const body = await response.json();
      providerDelay = Math.max(1000, Number(body.pollingIntervalMillis || providerDelay || 5000));

      if (!response.ok) {
        const kind = classifyFailure(response.status, body);
        if (kind === "reauthorize" && refreshAccessToken && authRefreshes < 2) {
          authRefreshes += 1;
          onStatus?.({ status: "refreshing_token", pageToken, providerDelay, authRefreshes });
          try {
            const refreshed = await refreshAccessToken();
            if (!refreshed) throw new Error("YouTube token refresh returned no access token.");
            currentAccessToken = refreshed;
            continue;
          } catch (refreshError) {
            if (signal?.aborted || refreshError?.name === "AbortError") return { status: "stopped", pageToken };
            if (isAuthorizationError(refreshError)) {
              onStatus?.({ status: "reauthorize", pageToken, providerDelay, error: refreshError instanceof Error ? refreshError.message : String(refreshError) });
              return { status: "reauthorize", pageToken };
            }
            const retryable = refreshError instanceof Error ? refreshError : new Error(String(refreshError));
            retryable.kind = "token_refresh_error";
            throw retryable;
          }
        }
        onStatus?.({ status: kind, pageToken, providerDelay });
        if (["ended", "disabled", "reauthorize"].includes(kind)) return { status: kind, pageToken };
        const error = new Error(body?.error?.message || kind);
        error.kind = kind;
        throw error;
      }

      authRefreshes = 0;
      const nextPageToken = body.nextPageToken || pageToken;
      if (Array.isArray(body.items) && body.items.length) await onMessages(body.items, nextPageToken);

      // Commit the provider checkpoint only after downstream delivery succeeds.
      pageToken = nextPageToken;
      reconnects = 0;
      delay = 1000;
      onStatus?.({ status: "healthy", pageToken, providerDelay, received: Array.isArray(body.items) ? body.items.length : 0 });

      if (body.offlineAt) return { status: "ended", pageToken, offlineAt: body.offlineAt };
      if (!(await abortableSleep(providerDelay, signal))) return { status: "stopped", pageToken };
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") return { status: "stopped", pageToken };
      reconnects += 1;
      onStatus?.({ status: error?.kind || "retrying", pageToken, reconnects, providerDelay, error: error instanceof Error ? error.message : String(error) });
      if (reconnects > maxReconnects) throw error;
      const retryDelay = Math.max(providerDelay, delay);
      if (!(await abortableSleep(retryDelay, signal))) return { status: "stopped", pageToken };
      delay = Math.min(delay * 2, 30000);
    }
  }

  return { status: "stopped", pageToken };
}
