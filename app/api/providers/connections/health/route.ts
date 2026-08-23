import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { probeYouTubeConnection, YouTubeConnectionError } from "@/lib/youtube-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectionRow = {
  provider: string;
  status: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  updated_at: string | null;
};

async function context(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Provider connection services are not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    user: data.user,
    admin: createClient(url, serviceKey, { auth: { persistSession: false } }),
  };
}

function baseHealth(row: ConnectionRow) {
  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  const expiresInMs = expiresAtMs ? expiresAtMs - Date.now() : null;
  return {
    provider: row.provider,
    storedStatus: row.status,
    accountId: row.provider_account_id,
    accountName: row.provider_account_name,
    scopes: row.scopes || [],
    expiresAt: row.expires_at,
    expiresInSeconds: expiresInMs === null ? null : Math.floor(expiresInMs / 1000),
    updatedAt: row.updated_at,
  };
}

function expiryFields(expiresAt: string | null) {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;
  return {
    expiresAt,
    expiresInSeconds: expiresAtMs ? Math.floor((expiresAtMs - Date.now()) / 1000) : null,
  };
}

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await context(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Service unavailable." }, { status: 503 });
  }
  if (!ctx) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await ctx.admin
    .from("provider_connections")
    .select("provider,status,provider_account_id,provider_account_name,scopes,expires_at,updated_at")
    .eq("owner_id", ctx.user.id)
    .order("provider");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as ConnectionRow[];
  const results = await Promise.all(rows.map(async (row) => {
    const common = baseHealth(row);
    if (row.provider !== "youtube") {
      const expiredByTime = Boolean(row.expires_at && Date.parse(row.expires_at) <= Date.now());
      return {
        ...common,
        health: expiredByTime ? "expired" : row.status === "connected" ? "stored_connected" : row.status,
        probed: false,
        requiresReconnect: expiredByTime || row.status !== "connected",
        message: expiredByTime
          ? "Stored provider authorization has expired and must be reconnected."
          : "Active provider probe is not implemented for this provider yet.",
      };
    }

    if (row.status !== "connected") {
      return {
        ...common,
        health: row.status,
        probed: false,
        requiresReconnect: row.status === "expired",
        message: row.status === "expired"
          ? "YouTube authorization has expired and must be reconnected."
          : "YouTube connection is not currently usable.",
      };
    }

    try {
      const probe = await probeYouTubeConnection(ctx.user.id);
      return {
        ...common,
        ...expiryFields(probe.expiresAt),
        health: "healthy",
        storedStatus: "connected",
        probed: true,
        requiresReconnect: false,
        accountId: probe.accountId || common.accountId,
        accountName: probe.accountName || common.accountName,
        updatedAt: probe.updatedAt || common.updatedAt,
        checkedAt: new Date().toISOString(),
      };
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : "YouTube connection probe failed.";
      const structured = probeError instanceof YouTubeConnectionError ? probeError : null;
      const requiresReconnect = structured?.requiresReconnect === true;
      const transient = structured?.transient === true;

      if (requiresReconnect) {
        const expectedUpdatedAt = structured?.observedUpdatedAt || row.updated_at;
        if (!expectedUpdatedAt) {
          return {
            ...common,
            health: "probe_error",
            probed: true,
            requiresReconnect: false,
            message: "Connection changed while the health probe was running; terminal state was not persisted.",
            errorCode: structured?.code || null,
            checkedAt: new Date().toISOString(),
          };
        }

        const updatedAt = new Date().toISOString();
        const { data: expiredRow, error: persistError } = await ctx.admin
          .from("provider_connections")
          .update({ status: "expired", updated_at: updatedAt })
          .eq("owner_id", ctx.user.id)
          .eq("provider", "youtube")
          .eq("status", "connected")
          .eq("updated_at", expectedUpdatedAt)
          .select("updated_at")
          .maybeSingle();
        if (persistError) {
          return {
            ...common,
            health: "probe_error",
            probed: true,
            requiresReconnect: true,
            message,
            errorCode: structured?.code || null,
            persistenceError: persistError.message,
            checkedAt: new Date().toISOString(),
          };
        }
        if (!expiredRow) {
          return {
            ...common,
            health: "connection_changed",
            probed: true,
            requiresReconnect: false,
            message: "Connection changed while the health probe was running; the newer connection was preserved.",
            errorCode: structured?.code || null,
            checkedAt: new Date().toISOString(),
          };
        }
        return {
          ...common,
          storedStatus: "expired",
          health: "expired",
          probed: true,
          requiresReconnect: true,
          message,
          errorCode: structured?.code || null,
          updatedAt,
          checkedAt: new Date().toISOString(),
        };
      }

      return {
        ...common,
        health: transient ? "temporarily_unavailable" : "probe_error",
        probed: true,
        requiresReconnect: false,
        message,
        errorCode: structured?.code || null,
        transient,
        checkedAt: new Date().toISOString(),
      };
    }
  }));

  return NextResponse.json({ connections: results });
}
