import test from "node:test";
import assert from "node:assert/strict";
import { runYouTubeChatConsumer } from "./youtube-chat.mjs";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("does not advance checkpoint when downstream delivery fails", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  let calls = 0;
  globalThis.fetch = async (url) => {
    seen.push(new URL(url).searchParams.get("pageToken"));
    calls += 1;
    if (calls === 1) return response({ items: [{ id: "m1" }], nextPageToken: "next-1", pollingIntervalMillis: 1 });
    return response({ error: { errors: [{ reason: "liveChatEnded" }] } }, 403);
  };
  try {
    let attempts = 0;
    const result = await runYouTubeChatConsumer({
      liveChatId: "chat",
      accessToken: "token",
      maxReconnects: 2,
      onMessages: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("downstream unavailable");
      },
    });
    assert.equal(result.status, "ended");
    assert.deepEqual(seen, [null, null]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("abort interrupts provider wait promptly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ items: [], nextPageToken: "next", pollingIntervalMillis: 30000 });
  try {
    const controller = new AbortController();
    const started = Date.now();
    const pending = runYouTubeChatConsumer({
      liveChatId: "chat",
      accessToken: "token",
      signal: controller.signal,
      onMessages: async () => {},
    });
    setTimeout(() => controller.abort(), 20);
    const result = await pending;
    assert.equal(result.status, "stopped");
    assert.ok(Date.now() - started < 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
