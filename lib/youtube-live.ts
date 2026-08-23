import { createClient } from "@supabase/supabase-js";
import { decryptProviderTokens, encryptProviderTokens } from "@/lib/provider-oauth";

type StoredConnection = {
  owner_id: string;
  encrypted_tokens: string;
  expires_at: string | null;
};

type TokenSet = Record<string, unknown> & {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export class YouTubeConnectionError extends Error {
  code: string;
  requiresReconnect: boolean;
  transient: boolean;

  constructor(message: string, options: { code: string; requiresReconnect?: boolean; transient?: boolean }) {
    super(message);
    this.name = "YouTubeConnectionError";
    this.code = options.code;
    this.requiresReconnect = Boolean(options.requiresReconnect);
    this.transient = Boolean(options.transient);
  }
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase provider services are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function loadYouTubeConnection(ownerId: string) {
  const { data, error } = await adminClient().from("provider_connections")
    .select("owner_id,encrypted_tokens,expires_at")
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
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new YouTubeConnectionError("YouTube access-token refresh timed out.", {
        code: "refresh_timeout",
        transient: true,
      });
    }
    throw error;
  }
  const refreshed = await response.json() as TokenSet;
  if (!response.ok || typeof refreshed.access_token !== "string") {
    const code = typeof refreshed.error === "string" ? refreshed.error : `refresh_http_${response.status}`;
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
  const { error } = await adminClient().from("provider_connections").update({
    encrypted_tokens: encryptProviderTokens(merged),
    expires_at: expiresAt,
    status: "connected",
    updated_at: updatedAt,
  }).eq("owner_id", connection.owner_id).eq("provider", "youtube");
  if (error) throw error;
  return { tokens: merged, expiresAt, updatedAt };
}

async function forceRefreshYouTubeAccessToken(ownerId: string) {
  const connection = await loadYouTubeConnection(ownerId);
  const tokens = decryptProviderTokens(connection.encrypted_tokens) as TokenSet;
  return (await refreshYouTubeTokens(connection, tokens)).tokens.access_token as string;
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
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json() as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  return { response, body };
}

export async function probeYouTubeConnection(ownerId: string) {
  let accessToken = await getYouTubeAccessToken(ownerId);
  let { response, body } = await fetchYouTubeChannel(accessToken);

  if (response.status === 401) {
    accessToken = await forceRefreshYouTubeAccessToken(ownerId);
    ({ response, body } = await fetchYouTubeChannel(accessToken));
  }

  if (!response.ok) {
    throw new YouTubeConnectionError(body.error?.message || `YouTube health probe returned ${response.status}.`, {
      code: `probe_http_${response.status}`,
      transient: response.status === 429 || response.status >= 500,
    });
  }

  const channel = body.items?.[0];
  const { data: connection, error: connectionError } = await adminClient()
    .from("provider_connections")
    .select("expires_at,updated_at")
    .eq("owner_id", ownerId)
    .eq("provider", "youtube")
    .maybeSingle();
  if (connectionError) throw connectionError;
  return {
    ok: true as const,
    provider: "youtube" as const,
    accountId: channel?.id || null,
    accountName: channel?.snippet?.title || null,
    expiresAt: connection?.expires_at || null,
    updatedAt: connection?.updated_at || null,
  };
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
