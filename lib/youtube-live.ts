import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { decryptProviderTokens, encryptProviderTokens } from "@/lib/provider-oauth";

type ProviderMetadata = Record<string, unknown>;

type StoredConnection = {
  owner_id: string;
  encrypted_tokens: string;
  expires_at: string | null;
  updated_at: string | null;
  metadata: ProviderMetadata;
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

type StoredProbeError = {
  message: string;
  code: string;
  requiresReconnect: boolean;
  transient: boolean;
  observedUpdatedAt: string | null;
};

type StoredProbeOutcome = {
  connectionUpdatedAt: string | null;
  checkedAt: string;
  result?: YouTubeProbeResult;
  error?: StoredProbeError;
};

type StoredProbeLock = {
  token: string;
  connectionUpdatedAt: string | null;
  startedAt: string;
  expiresAt: string;
};

type AccessTokenState = {
  accessToken: string;
  updatedAt: string | null;
};

const YOUTUBE_PROBE_COOLDOWN_MS = 60_000;
const YOUTUBE_PROBE_LOCK_MS = 30_000;
const PROBE_OUTCOME_KEY = "youtube_health_probe";
const PROBE_LOCK_KEY = "youtube_health_probe_lock";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStoredProbeOutcome(metadata: ProviderMetadata): StoredProbeOutcome | null {
  const raw = asRecord(metadata[PROBE_OUTCOME_KEY]);
  if (!raw || typeof raw.checkedAt !== "string") return null;
  const result = asRecord(raw.result);
  const error = asRecord(raw.error);
  return {
    connectionUpdatedAt: typeof raw.connectionUpdatedAt === "string" ? raw.connectionUpdatedAt : null,
    checkedAt: raw.checkedAt,
    result: result
      ? {
          ok: true,
          provider: "youtube",
          accountId: typeof result.accountId === "string" ? result.accountId : null,
          accountName: typeof result.accountName === "string" ? result.accountName : null,
          expiresAt: typeof result.expiresAt === "string" ? result.expiresAt : null,
          updatedAt: typeof result.updatedAt === "string" ? result.updatedAt : null,
          checkedAt: raw.checkedAt,
        }
      : undefined,
    error: error && typeof error.message === "string" && typeof error.code === "string"
      ? {
          message: error.message,
          code: error.code,
          requiresReconnect: error.requiresReconnect === true,
          transient: error.transient === true,
          observedUpdatedAt: typeof error.observedUpdatedAt === "string" ? error.observedUpdatedAt : null,
        }
      : undefined,
  };
}

function readStoredProbeLock(metadata: ProviderMetadata): StoredProbeLock | null {
  const raw = asRecord(metadata[PROBE_LOCK_KEY]);
  if (!raw || typeof raw.token !== "string" || typeof raw.startedAt !== "string" || typeof raw.expiresAt !== "string") return null;
  return {
    token: raw.token,
    connectionUpdatedAt: typeof raw.connectionUpdatedAt === "string" ? raw.connectionUpdatedAt : null,
    startedAt: raw.startedAt,
    expiresAt: raw.expiresAt,
  };
}

function cachedOutcome(connection: StoredConnection): YouTubeProbeResult | null {
  const outcome = readStoredProbeOutcome(connection.metadata);
  if (!outcome || outcome.connectionUpdatedAt !== connection.updated_at) return null;
  const checkedAtMs = Date.parse(outcome.checkedAt);
  if (!Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs >= YOUTUBE_PROBE_COOLDOWN_MS) return null;
  if (outcome.result) return outcome.result;
  if (outcome.error) {
    throw new YouTubeConnectionError(outcome.error.message, {
      code: outcome.error.code,
      requiresReconnect: outcome.error.requiresReconnect,
      transient: outcome.error.transient,
      observedUpdatedAt: outcome.error.observedUpdatedAt,
      checkedAt: outcome.checkedAt,
    });
  }
  return null;
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
    .select("owner_id,encrypted_tokens,expires_at,updated_at,metadata")
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
  return {
    ...data,
    metadata: asRecord(data.metadata) || {},
  } as StoredConnection;
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

async function getYouTubeAccessTokenState(ownerId: string, forceRefresh = false): Promise<AccessTokenState> {
  const connection = await loadYouTubeConnection(ownerId);
  const tokens = decryptProviderTokens(connection.encrypted_tokens) as TokenSet;
  const expiresAt = connection.expires_at ? Date.parse(connection.expires_at) : 0;
  const needsRefresh = forceRefresh || !tokens.access_token || !expiresAt || expiresAt <= Date.now() + 60_000;
  if (needsRefresh) {
    const refreshed = await refreshYouTubeTokens(connection, tokens);
    return {
      accessToken: refreshed.tokens.access_token as string,
      updatedAt: refreshed.updatedAt,
    };
  }
  return {
    accessToken: tokens.access_token as string,
    updatedAt: connection.updated_at,
  };
}

export async function getYouTubeAccessToken(ownerId: string) {
  return (await getYouTubeAccessTokenState(ownerId)).accessToken;
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

async function reserveSharedProbe(ownerId: string, connection: StoredConnection) {
  const cached = cachedOutcome(connection);
  if (cached) return { cached, connection, lockToken: null as string | null };

  const existingLock = readStoredProbeLock(connection.metadata);
  const lockActive = existingLock && Date.parse(existingLock.expiresAt) > Date.now();
  if (lockActive && existingLock.connectionUpdatedAt === connection.updated_at) {
    throw new YouTubeConnectionError("A YouTube health probe is already in progress.", {
      code: "probe_in_progress",
      transient: true,
      observedUpdatedAt: connection.updated_at,
      checkedAt: existingLock.startedAt,
    });
  }

  const lockToken = randomUUID();
  const now = new Date();
  const lock: StoredProbeLock = {
    token: lockToken,
    connectionUpdatedAt: connection.updated_at,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + YOUTUBE_PROBE_LOCK_MS).toISOString(),
  };
  const nextMetadata: ProviderMetadata = {
    ...connection.metadata,
    [PROBE_LOCK_KEY]: lock,
  };

  let query = adminClient().from("provider_connections")
    .update({ metadata: nextMetadata })
    .eq("owner_id", ownerId)
    .eq("provider", "youtube")
    .eq("status", "connected");
  query = connection.updated_at ? query.eq("updated_at", connection.updated_at) : query.is("updated_at", null);
  query = existingLock?.token
    ? query.eq(`metadata->${PROBE_LOCK_KEY}->>token`, existingLock.token)
    : query.is(`metadata->${PROBE_LOCK_KEY}`, null);

  const { data, error } = await query
    .select("owner_id,encrypted_tokens,expires_at,updated_at,metadata")
    .maybeSingle();
  if (error) throw error;
  if (data) {
    return {
      cached: null as YouTubeProbeResult | null,
      connection: { ...data, metadata: asRecord(data.metadata) || {} } as StoredConnection,
      lockToken,
    };
  }

  const latest = await loadYouTubeConnection(ownerId);
  const latestCached = cachedOutcome(latest);
  if (latestCached) return { cached: latestCached, connection: latest, lockToken: null as string | null };
  const latestLock = readStoredProbeLock(latest.metadata);
  if (latestLock && Date.parse(latestLock.expiresAt) > Date.now()) {
    throw new YouTubeConnectionError("A YouTube health probe is already in progress.", {
      code: "probe_in_progress",
      transient: true,
      observedUpdatedAt: latest.updated_at,
      checkedAt: latestLock.startedAt,
    });
  }
  throw new YouTubeConnectionError("The YouTube connection changed while reserving a health probe.", {
    code: "probe_reservation_conflict",
    transient: true,
    observedUpdatedAt: latest.updated_at,
  });
}

async function moveSharedProbeLock(ownerId: string, lockToken: string, updatedAt: string | null) {
  const current = await loadYouTubeConnection(ownerId);
  if (current.updated_at !== updatedAt) return false;
  const lock = readStoredProbeLock(current.metadata);
  if (!lock || lock.token !== lockToken) return false;
  const nextMetadata: ProviderMetadata = {
    ...current.metadata,
    [PROBE_LOCK_KEY]: {
      ...lock,
      connectionUpdatedAt: updatedAt,
      expiresAt: new Date(Date.now() + YOUTUBE_PROBE_LOCK_MS).toISOString(),
    },
  };
  let query = adminClient().from("provider_connections")
    .update({ metadata: nextMetadata })
    .eq("owner_id", ownerId)
    .eq("provider", "youtube")
    .eq("status", "connected")
    .eq(`metadata->${PROBE_LOCK_KEY}->>token`, lockToken);
  query = updatedAt ? query.eq("updated_at", updatedAt) : query.is("updated_at", null);
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function storeSharedProbeOutcome(
  ownerId: string,
  lockToken: string,
  expectedUpdatedAt: string | null,
  outcome: YouTubeProbeResult | YouTubeConnectionError,
) {
  const current = await loadYouTubeConnection(ownerId);
  if (current.updated_at !== expectedUpdatedAt) return false;
  const lock = readStoredProbeLock(current.metadata);
  if (!lock || lock.token !== lockToken) return false;

  const checkedAt = outcome instanceof YouTubeConnectionError
    ? outcome.checkedAt || new Date().toISOString()
    : outcome.checkedAt;
  const storedOutcome: StoredProbeOutcome = outcome instanceof YouTubeConnectionError
    ? {
        connectionUpdatedAt: expectedUpdatedAt,
        checkedAt,
        error: {
          message: outcome.message,
          code: outcome.code,
          requiresReconnect: outcome.requiresReconnect,
          transient: outcome.transient,
          observedUpdatedAt: outcome.observedUpdatedAt,
        },
      }
    : {
        connectionUpdatedAt: expectedUpdatedAt,
        checkedAt,
        result: outcome,
      };

  const nextMetadata: ProviderMetadata = {
    ...current.metadata,
    [PROBE_OUTCOME_KEY]: storedOutcome,
  };
  delete nextMetadata[PROBE_LOCK_KEY];

  let query = adminClient().from("provider_connections")
    .update({ metadata: nextMetadata })
    .eq("owner_id", ownerId)
    .eq("provider", "youtube")
    .eq("status", "connected")
    .eq(`metadata->${PROBE_LOCK_KEY}->>token`, lockToken);
  query = expectedUpdatedAt ? query.eq("updated_at", expectedUpdatedAt) : query.is("updated_at", null);
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function probeYouTubeConnection(ownerId: string): Promise<YouTubeProbeResult> {
  const initialConnection = await loadYouTubeConnection(ownerId);
  const reservation = await reserveSharedProbe(ownerId, initialConnection);
  if (reservation.cached) return reservation.cached;
  if (!reservation.lockToken) {
    throw new YouTubeConnectionError("YouTube health probe reservation is unavailable.", {
      code: "probe_reservation_unavailable",
      transient: true,
      observedUpdatedAt: reservation.connection.updated_at,
    });
  }

  const lockToken = reservation.lockToken;
  let probedUpdatedAt = reservation.connection.updated_at;

  try {
    let tokenState = await getYouTubeAccessTokenState(ownerId);
    probedUpdatedAt = tokenState.updatedAt;
    if (!(await moveSharedProbeLock(ownerId, lockToken, probedUpdatedAt))) {
      throw new YouTubeConnectionError("YouTube connection changed before the health probe could start.", {
        code: "probe_connection_changed",
        transient: true,
        observedUpdatedAt: probedUpdatedAt,
      });
    }

    let { response, body } = await fetchYouTubeChannel(tokenState.accessToken);
    let refreshedAfter401 = false;

    if (response.status === 401) {
      tokenState = await getYouTubeAccessTokenState(ownerId, true);
      probedUpdatedAt = tokenState.updatedAt;
      if (!(await moveSharedProbeLock(ownerId, lockToken, probedUpdatedAt))) {
        throw new YouTubeConnectionError("YouTube connection changed during token refresh.", {
          code: "probe_connection_changed",
          transient: true,
          observedUpdatedAt: probedUpdatedAt,
        });
      }
      refreshedAfter401 = true;
      ({ response, body } = await fetchYouTubeChannel(tokenState.accessToken));
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
    if (!(await storeSharedProbeOutcome(ownerId, lockToken, probedUpdatedAt, result))) {
      throw new YouTubeConnectionError("YouTube connection changed before the health result could be stored.", {
        code: "probe_connection_changed",
        transient: true,
        observedUpdatedAt: probedUpdatedAt,
        checkedAt,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof YouTubeConnectionError) {
      error.checkedAt ||= new Date().toISOString();
      if (!error.observedUpdatedAt) error.observedUpdatedAt = probedUpdatedAt;
      try {
        await storeSharedProbeOutcome(ownerId, lockToken, error.observedUpdatedAt, error);
      } catch {
        // Preserve the provider error when the shared cooldown state cannot be updated.
      }
    }
    throw error;
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
