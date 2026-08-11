import { NextResponse } from "next/server";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const youtube = {
    provider: "youtube",
    oauthConfigured: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    connectorConfigured: Boolean(process.env.LIVE_CONNECTOR_SECRET),
    callbackUrl: appUrl ? `${appUrl}/api/providers/youtube/callback` : null,
  };
  const meta = {
    provider: "meta",
    oauthConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    webhookConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET),
    webhookUrl: appUrl ? `${appUrl}/api/live/providers/meta` : null,
    callbackUrl: appUrl ? `${appUrl}/api/providers/meta/callback` : null,
  };
  return NextResponse.json({ youtube, meta });
}
