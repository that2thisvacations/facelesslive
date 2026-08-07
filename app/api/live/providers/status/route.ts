import { NextResponse } from "next/server";

export async function GET() {
  const youtubeConfigured = Boolean(process.env.LIVE_CONNECTOR_SECRET);
  const metaConfigured = Boolean(process.env.LIVE_CONNECTOR_SECRET && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN);
  const speechConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.BROADCAST_WORKER_URL);

  return NextResponse.json({
    providers: [
      {
        id: "youtube",
        name: "YouTube Live",
        configured: youtubeConfigured,
        status: youtubeConfigured ? "adapter_ready" : "needs_setup",
        requirements: ["Authorized YouTube live-chat polling/subscription process", "LIVE_CONNECTOR_SECRET", "External stream mapping"],
      },
      {
        id: "meta",
        name: "Facebook / Instagram Live",
        configured: metaConfigured,
        status: metaConfigured ? "webhook_ready" : "needs_setup",
        requirements: ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "LIVE_CONNECTOR_SECRET", "Meta webhook subscription", "External stream mapping"],
      },
      {
        id: "speech",
        name: "Live AI Speech",
        configured: speechConfigured,
        status: speechConfigured ? "ready" : "needs_setup",
        requirements: ["OPENAI_API_KEY", "BROADCAST_WORKER_URL", "BROADCAST_WORKER_TOKEN when worker auth is enabled"],
      },
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}
