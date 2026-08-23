import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { probeYouTubeConnection } from "@/lib/youtube-live";

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
      return {
        ...common,
        health: row.status === "connected" ? "stored_connected" : row.status,
        probed: false,
        requiresReconnect: row.status !== "connected",
        message: "Active provider probe is not implemented for this provider yet.",
      };
    }

    try {
      const probe = await probeYouTubeConnection(ctx.user.id);
      return {
        ...common,
        health: "healthy",
        probed: true,
        requiresReconnect: false,
        accountId: probe.accountId || common.accountId,
        accountName: probe.accountName || common.accountName,
        checkedAt: new Date().toISOString(),
      };
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : "YouTube connection probe failed.";
      const requiresReconnect = /reconnect|authorization|invalid_grant|not connected/i.test(message);
      const nextStatus = requiresReconnect ? "expired" : "error";
      const { error: persistError } = await ctx.admin
        .from("provider_connections")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("owner_id", ctx.user.id)
        .eq("provider", "youtube");
      if (persistError) {
        return {
          ...common,
          health: "probe_error",
          probed: true,
          requiresReconnect,
          message,
          persistenceError: persistError.message,
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        ...common,
        storedStatus: nextStatus,
        health: nextStatus,
        probed: true,
        requiresReconnect,
        message,
        checkedAt: new Date().toISOString(),
      };
    }
  }));

  return NextResponse.json({ connections: results });
}
