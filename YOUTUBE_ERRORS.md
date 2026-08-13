# YouTube ingestion error states

Production orchestration should distinguish reauthorization required, chat ended, chat disabled, provider rate limiting, and generic provider errors so the UI can stop ingestion or request reconnection cleanly.
