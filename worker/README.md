# FacelessLive Broadcast Worker

This service runs long-lived FFmpeg RTMP sessions outside the Vercel request lifecycle.

## Endpoints

- `GET /health` — worker health and active job count
- `POST /broadcast` — start a presenter-media RTMP broadcast
- `GET /jobs/:jobId` — inspect in-memory worker state
- `POST /jobs/:jobId/overlay` — update the real-time live response overlay for an active broadcast
- `POST /jobs/:jobId/stop` — stop an active broadcast

## Required environment variables

```text
PORT=8080
BROADCAST_WORKER_TOKEN=<same token configured in FacelessLive>
FACELESSLIVE_APP_URL=https://your-facelesslive-domain.example
BROADCAST_CALLBACK_SECRET=<same callback secret configured in FacelessLive>
```

Set the FacelessLive application variable `BROADCAST_WORKER_URL` to the worker's `/broadcast` endpoint, for example:

```text
BROADCAST_WORKER_URL=https://worker.example.com/broadcast
```

## Real-time overlays

The worker creates reloadable FFmpeg text sources for every active broadcast. FacelessLive can update them without restarting FFmpeg:

```text
POST /jobs/<jobId>/overlay
Authorization: Bearer <BROADCAST_WORKER_TOKEN>
Content-Type: application/json

{
  "title": "@viewer",
  "subtitle": "AI-generated live response",
  "duration": 12
}
```

The overlay automatically clears after the requested duration. Duration is constrained to 3–30 seconds.

## Container build

Build from this directory so `server.mjs` is in the Docker build context.

```text
docker build -t facelesslive-broadcast-worker .
docker run --rm -p 8080:8080 --env-file .env facelesslive-broadcast-worker
```

The container installs FFmpeg and continuously loops the generated presenter video while publishing H.264/AAC to the selected RTMP/RTMPS destination. Broadcast state is reported back to FacelessLive through the authenticated callback endpoint. Timed commerce scenes and real-time response overlays are rendered in the same FFmpeg process.
