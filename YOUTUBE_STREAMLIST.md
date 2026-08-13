# Low-latency YouTube target

Use YouTube liveChatMessages.streamList in the long-running ingestion worker for production low-latency chat. Keep the REST chat reader as a reconnect and fallback path using its continuation token and provider-directed polling interval.
