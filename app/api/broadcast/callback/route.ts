import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CallbackBody = {
  jobId?: string;
  status?: "starting" | "live" | "ended" | "error";
  error?: string;
};

const ALLOWED = new Set(["starting", "live", "ended", "error"]);

export async function POST(request: Request) {
  const expected = process.env.BROADCAST_CALLBACK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!expected || !serviceKey || !url) {
    return NextResponse.json({ error: "Broadcast callback is not configured." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized callback." }, { status: 401 });
  }

  let body: CallbackBody;
  try { body = (await request.json()) as CallbackBody; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  if (!body.jobId || !body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: "A valid jobId and status are required." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("stream_jobs").update({
    status: body.status,
    error_message: body.status === "error" ? body.error || "Broadcast worker reported an error." : null,
    updated_at: new Date().toISOString(),
  }).eq("id", body.jobId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
