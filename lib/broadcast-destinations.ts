export type BroadcastDestination = {
  id: "tiktok" | "youtube" | "facebook" | "custom-rtmp";
  name: string;
  status: "available" | "coming_soon";
  setup: "oauth" | "stream_key";
  description: string;
};

export const broadcastDestinations: BroadcastDestination[] = [
  {
    id: "custom-rtmp",
    name: "Custom RTMP",
    status: "available",
    setup: "stream_key",
    description: "Connect any supported live platform with an RTMP server URL and stream key.",
  },
  {
    id: "youtube",
    name: "YouTube Live",
    status: "coming_soon",
    setup: "oauth",
    description: "Authorize a YouTube channel and schedule shoppable livestreams.",
  },
  {
    id: "tiktok",
    name: "TikTok LIVE",
    status: "coming_soon",
    setup: "oauth",
    description: "Connect eligible TikTok LIVE and Shop accounts when platform access is approved.",
  },
  {
    id: "facebook",
    name: "Facebook Live",
    status: "coming_soon",
    setup: "oauth",
    description: "Connect a Page or professional account for live commerce broadcasts.",
  },
];
