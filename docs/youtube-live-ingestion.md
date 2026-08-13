# YouTube live-chat ingestion

FacelessLive now has server-side helpers for connected YouTube accounts:

1. Load the user's encrypted YouTube provider connection.
2. Refresh an expired access token with the stored refresh token.
3. Discover the user's active YouTube broadcast and its live chat ID.
4. Read live-chat text messages with continuation tokens.
5. Respect YouTube's returned polling interval when using the REST fallback.

## Production orchestration

A long-running worker should prefer YouTube `liveChatMessages.streamList` for low-latency server-streamed delivery. The REST chat route is the reconnect/fallback path and returns `nextPageToken` plus `pollingIntervalMillis` so the caller can resume without over-polling.

Do not expose provider tokens to the browser. Provider tokens remain encrypted in `provider_connections` and are decrypted only server-side.

## Remaining wiring

The long-running ingestion worker must authenticate its FacelessLive owner context, map the YouTube broadcast ID to the active `live_stream_mappings` record, and forward normalized messages to `/api/live/connectors`. The connector already owns deduplication, AI-response policy, moderation, overlays, and Safe Auto-Speak.
