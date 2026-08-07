# FacelessLive Broadcast Worker

This service runs long-lived FFmpeg RTMP sessions outside the Vercel request lifecycle.

## Endpoints

- `GET /health` — worker health and active job count
- `POST /broadcast` — start a presenter-media RTMP broadcast
- `GET /jobs/:jobId` — inspect in-memory worker state
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

## Container build

Build from this directory so `server.mjs` is in the Docker build context.

```text
docker build -t facelesslive-broadcast-worker .
docker run --rm -p 8080:8080 --env-file .env facelesslive-broadcast-worker
```

The container installs FFmpeg and continuously loops the generated presenter video while publishing H.264/AAC to the selected RTMP/RTMPS destination. Broadcast state is reported back to FacelessLive through the authenticated callback endpoint.
