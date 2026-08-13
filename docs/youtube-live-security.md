# YouTube ingestion authentication boundary

The current discovery/chat endpoints are an implementation scaffold. Before production deployment, replace any caller-supplied owner context with the same Supabase session validation already used by FacelessLive authenticated APIs, or invoke the ingestion loop only from a trusted worker using a server-side identity.

Never accept an arbitrary owner identifier from an untrusted browser as authorization. The production worker must resolve the account owner from an authenticated session or trusted server credential before decrypting provider tokens.
