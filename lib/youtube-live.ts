import { createClient } from "@supabase/supabase-js";
import { decryptProviderTokens, encryptProviderTokens } from "@/lib/provider-oauth";

type StoredConnection = {
  owner_id: string;
  encrypted_tokens: string;
  expires_at: string | null;
  updated_at: string | null;
};

type TokenSet = Record<string, unknown> & {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type ChannelBody = {
  items?: Array<{ id?: string; snippet?: { title?: string } }>;
  error?: {
    message?: string;
    errors?: Array<{ reason?: string }>;
  };
};

type YouTubeProbeResult = {
  ok: true;
  provider: "youtube";
  accountId: string | null;
  accountName: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  checkedAt: string;
};

type YouTubeProbeCacheEntry = {
  connectionUpdatedAt: string | null;
  checkedAtMs: number;
  result?: YouTubeProbeResult;
  error?: YouTubeConnectionError;
};

type YouTubeProbeInFlightEntry = {
  connectionUpdatedAt: string | null;
  promise: Promise<YouTubeProbeResult>;
};

const YOUTUBE_PROBE_CACHE_TTL_MS = 60_000;
const youtubeProbeCache = new Map<string, YouTubeProbeCacheEntry>();
const youtubeProbeInFlight = new Map<string, YouTubeProbeInFlightEntry>();

export class YouTubeConnectionError extends Error {
  code: string;
  requiresReconnect: boolean;
  transient: boolean;
  observedUpdatedAt: string | null;
  checkedAt: string | null;

  constructor(message: string, options: { code: string; requiresReconnect?: boolean; transient?: boolean; observedUpdatedAt?: string | null; checkedAt?: string | null }) {
    super(message);
    this.name = "YouTubeConnectionError";
    this.code = options.code;
    this.requiresReconnect = Boolean(options.requiresReconnect);
    this.transient = Boolean(options.transient);
    this.observedUpdatedAt = options.observedUpdatedAt || null;
    this.checkedAt = options.checkedAt || null;
  }
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase provider services are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function parseJsonBody<T>(response: Response, context: "refresh" | "probe"): Promise<T | null> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const label = context === "refresh" ? "access-token refresh" : "channel probe";
    throw new YouTubeConnectionError(
      timedOut ? `YouTube ${label} timed out while reading the provider response.` : `YouTube ${label} lost the provider connection while reading the response.`,
      {
        code: `${context}_body_${timedOut ? "timeout" : "transport_error"}`,
        transient: true,
      },
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function loadYouTubeConnection(ownerId: string) {
  const { data, error } = await adminClient().from("provider_connections")
    .select("owner_id,encrypted_tokens,expires_at,updated_at")
    .eq("owner_id", ownerId)
    .eq("provider", "youtube")
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw error;
  if (!data?.encrypted_tokens) {
    throw new YouTubeConnectionError("YouTube is not connected.", {
      code: "not_connected",
      requiresReconnect: true,
    });
  }
  return data as StoredConnection;
}

async function refreshYouTubeTokens(connection: StoredConnection, tokens: TokenSet) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : null;
  if (!refreshToken) {
    throw new YouTubeConnectionError("YouTube authorization must be reconnected.", {
      code: "missing_refresh_token",
      requiresReconnect: true,
    });
  }
  if (!clientId || !clientSecret) {
    throw new YouTubeConnectionError("YouTube OAuth client configuration is unavailable.", {
      code: "oauth_client_unconfigured",
    });
  }

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new YouTubeConnectionError(
      timedOut ? "YouTube access-token refresh timed out." : "YouTube access-token refresh could not reach the provider.",
      {
        code: timedOut ? "refresh_timeout" : "refresh_transport_error",
        transient: true,
      },
    );
  }

  const refreshed = await parseJsonBody<TokenSet>(response, "refresh");
  if (!response.ok || typeof refreshed?.access_token !== "string") {
    const code = typeof refreshed?.error === "string" ? refreshed.error : `refresh_http_${response.status}`;
    const requiresReconnect = code === "invalid_grant";
    throw new YouTubeConnectionError(
      requiresReconnect ? "YouTube authorization must be reconnected." : "YouTube access-token refresh failed.",
      {
        code,
        requiresReconnect,
        transient: response.status === 429 || response.status >= 500,
      },
    );
  }

  const merged: TokenSet = { ...tokens, ...refreshed, refresh_token: refreshToken };
  const expiresIn = typeof refreshed.expires_in === "number" ? refreshed.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const updatedAt = new Date().toISOString();

  let updateQuery = adminClient().from("provider_connections").update({
    encrypted_tokens: encryptProviderTokens(merged),
    expires_at: expiresAt,
    status: "connected",
    updated_at: updatedAt,
  })
    .eq("owner_id", connection.owner_id)
    .eq("provider", "youtube")
    .eq("status", "connected");

  updateQuery = connection.updated_at
    ? updateQuery.eq("updated_at", connection.updated_at)
    : updateQuery.is("updated_at", null);

  const { data: updatedRow, error } = await updateQuery
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;

  if (!updatedRow) {
    const winner = await loadYouTubeConnection(connection.owner_id);
    const winnerTokens = decryptProviderTokens(winner.encrypted_tokens) as TokenSet;
    if (typeof winnerTokens.access_token === "string") {
      return {
        tokens: winnerTokens,
        expiresAt: winner.expires_at,
        updatedAt: winner.updated_at,
      };
    }
    throw new YouTubeConnectionError("YouTube connection changed while refreshing and no usable access token is available.", {
      code: "refresh_connection_changed",
      transient: true,
    });
  }

  return { tokens: merged, expiresAt, updatedAt: updatedRow.updated_at || updatedAt };
}

async function forceRefreshYouTubeAccessToken(ownerId: string) {
  const connection = await loadYouTubeConnection(ownerId);
  const tokens = decryptProviderTokens(connection.encrypted_tokens) as TokenSet;
  const refreshed = await refreshYouTubeTokens(connection, tokens);
  return {
    accessToken: refreshed.tokens.access_token as string,
    updatedAt: refreshed.updatedAt,
  };
}

export async function getYouTubeAccessToken(ownerId: string) {
  const connection = await loadYouTubeConnection(ownerId);
  const tokens = decryptProviderTokens(connection.encrypted_tokens) as TokenSet;
  const expiresAt = connection.expires_at ? Date.parse(connection.expires_at) : 0;
  const needsRefresh = !tokens.access_token || !expiresAt || expiresAt <= Date.now() + 60_000;
  if (needsRefresh) return (await refreshYouTubeTokens(connection, tokens)).tokens.access_token as string;
  return tokens.access_token as string;
}

async function fetchYouTubeChannel(accessToken: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "1");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new YouTubeConnectionError(
      timedOut ? "YouTube channel probe timed out." : "YouTube channel probe could not reach the provider.",
      {
        code: timedOut ? "probe_timeout" : "probe_transport_error",
        transient: true,
      },
    );
  }

  const body = await parseJsonBody<ChannelBody>(response, "probe");
  return { response, body: body || {} };
}

function isRetryableYouTube403(body: ChannelBody) {
  const retryableReasons = new Set(["quotaExceeded", "userRateLimitExceeded", "rateLimitExceeded"]);
  return body.error?.errors?.some((entry) => entry.reason && retryableReasons.has(entry.reason)) === true;
}

async function performYouTubeProbe(
  ownerId: string,
  connectionAtStart: StoredConnection,
  updateInFlightVersion: (updatedAt: string | null) => void,
): Promise<YouTubeProbeResult> {
  let probedUpdatedAt = connectionAtStart.updated_at;

  try {
    let accessToken = await getYouTubeAccessToken(ownerId);
    probedUpdatedAt = (await loadYouTubeConnection(ownerId)).updated_at;
    updateInFlightVersion(probedUpdatedAt);
    let { response, body } = await fetchYouTubeChannel(accessToken);
    let refreshedAfter401 = false;

    if (response.status === 401) {
      const refreshed = await forceRefreshYouTubeAccessToken(ownerId);
      accessToken = refreshed.accessToken;
      probedUpdatedAt = refreshed.updatedAt;
      updateInFlightVersion(probedUpdatedAt);
      refreshedAfter401 = true;
      ({ response, body } = await fetchYouTubeChannel(accessToken));
    }

    if (!response.ok) {
      const requiresReconnect = refreshedAfter401 && response.status === 401;
      const transient = response.status === 429 || response.status >= 500 || (response.status === 403 && isRetryableYouTube403(body));
      throw new YouTubeConnectionError(body.error?.message || `YouTube health probe returned ${response.status}.`, {
        code: `probe_http_${response.status}`,
        requiresReconnect,
        transient,
        observedUpdatedAt: probedUpdatedAt,
      });
    }

    const checkedAt = new Date().toISOString();
    const connection = await loadYouTubeConnection(ownerId);
    if (connection.updated_at !== probedUpdatedAt) {
      throw new YouTubeConnectionError("YouTube connection changed while the health probe was running; retry with the newer connection.", {
        code: "probe_connection_changed",
        transient: true,
        observedUpdatedAt: probedUpdatedAt,
        checkedAt,
      });
    }

    const channel = body.items?.[0];
    const result: YouTubeProbeResult = {
      ok: true,
      provider: "youtube",
      accountId: channel?.id || null,
      accountName: channel?.snippet?.title || null,
      expiresAt: connection.expires_at,
      updatedAt: connection.updated_at,
      checkedAt,
    };
    youtubeProbeCache.set(ownerId, {
      connectionUpdatedAt: probedUpdatedAt,
      checkedAtMs: Date.parse(checkedAt),
      result,
    });
    return result;
  } catch (error) {
    if (error instanceof YouTubeConnectionError) {
      error.checkedAt ||= new Date().toISOString();
      if (!error.observedUpdatedAt) error.observedUpdatedAt = probedUpdatedAt;

      if (!error.requiresReconnect) {
        let latestUpdatedAt: string | null = null;
        try {
          latestUpdatedAt = (await loadYouTubeConnection(ownerId)).updated_at;
        } catch {
          latestUpdatedAt = null;
        }
        if (latestUpdatedAt === error.observedUpdatedAt) {
          youtubeProbeCache.set(ownerId, {
            connectionUpdatedAt: error.observedUpdatedAt,
            checkedAtMs: Date.parse(error.checkedAt),
            error,
          });
        } else {
          youtubeProbeCache.delete(ownerId);
        }
      } else {
        youtubeProbeCache.delete(ownerId);
      }
    } else {
      youtubeProbeCache.delete(ownerId);
    }
    throw error;
  }
}

export async function probeYouTubeConnection(ownerId: string): Promise<YouTubeProbeResult> {
  const connectionAtStart = await loadYouTubeConnection(ownerId);
  const cached = youtubeProbeCache.get(ownerId);
  if (
    cached
    && cached.connectionUpdatedAt === connectionAtStart.updated_at
    && Date.now() - cached.checkedAtMs < YOUTUBE_PROBE_CACHE_TTL_MS
  ) {
    if (cached.error) throw cached.error;
    if (cached.result) return cached.result;
  }

  const existing = youtubeProbeInFlight.get(ownerId);
  if (existing && existing.connectionUpdatedAt === connectionAtStart.updated_at) {
    return existing.promise;
  }

  let entry: YouTubeProbeInFlightEntry;
  const promise = performYouTubeProbe(ownerId, connectionAtStart, (updatedAt) => {
    const current = youtubeProbeInFlight.get(ownerId);
    if (current?.promise === entry.promise) current.connectionUpdatedAt = updatedAt;
  });
  entry = { connectionUpdatedAt: connectionAtStart.updated_at, promise };
  youtubeProbeInFlight.set(ownerId, entry);

  try {
    return await promise;
  } finally {
    const current = youtubeProbeInFlight.get(ownerId);
    if (current?.promise === promise) youtubeProbeInFlight.delete(ownerId);
  }
}

export async function findActiveYouTubeBroadcast(accessToken: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts");
  url.searchParams.set("part", "id,snippet,status");
  url.searchParams.set("broadcastStatus", "active");
  url.searchParams.set("broadcastType", "all");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "5");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const body = await response.json() as { items?: Array<{ id?: string; snippet?: { liveChatId?: string; title?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Unable to discover the active YouTube broadcast.");
  const broadcast = body.items?.find((item) => item.id && item.snippet?.liveChatId);
  return broadcast ? { broadcastId: broadcast.id as string, liveChatId: broadcast.snippet?.liveChatId as string, title: broadcast.snippet?.title || "YouTube Live" } : null;
}
