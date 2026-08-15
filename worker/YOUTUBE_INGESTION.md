# YouTube live-chat worker

FacelessLive keeps YouTube chat ingestion in the long-running worker rather than a serverless request lifecycle.

## Lifecycle

1. The app resolves the authenticated owner and refreshes the stored YouTube OAuth access token when needed.
2. The app discovers the active broadcast and `liveChatId`.
3. The mapped FacelessLive stream job hands the worker the chat identity and short-lived access token.
4. The worker consumes live chat continuously, retaining the latest `nextPageToken` so reconnects resume from the last acknowledged point.
5. Normalized messages are sent through the existing `/api/live/connectors` pipeline for deduplication, moderation, AI response generation, overlays, and Safe Auto-Speak.
6. Ingestion stops when YouTube reports the chat ended/disabled, the broadcast job stops, or authorization must be renewed.

## Recovery

Transient provider/network failures use bounded exponential backoff. Rate-limit responses are not retried aggressively. The worker should request a refreshed token from the app when authorization expires rather than storing refresh credentials itself.

## Provider strategy

The presenter/avatar pipeline remains provider-neutral. HeyGen may be added later as one optional avatar provider without coupling YouTube ingestion or broadcast orchestration to HeyGen.
