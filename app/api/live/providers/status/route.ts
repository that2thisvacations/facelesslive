import { NextResponse } from "next/server";

export async function GET() {
  const youtube = {
    provider: "youtube",
    configured: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    webhookReady: Boolean(process.env.LIVE_CONNECTOR_SECRET),
  };
  const meta = {
    provider: "meta",
    configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    webhookReady: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET),
  };
  const tiktok = {
    provider: "tiktok",
    configured: false,
    webhookReady: Boolean(process.env.LIVE_CONNECTOR_SECRET),
  };

  return NextResponse.json({ providers: [youtube, meta, tiktok] }, { status: 200 });
}
