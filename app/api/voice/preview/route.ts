import { NextResponse } from "next/server";

type VoiceRequest = { text?: string; voice?: string };

const ALLOWED_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]);

export async function POST(request: Request) {
  let body: VoiceRequest;
  try {
    body = (await request.json()) as VoiceRequest;
  } catch {
    return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "Voice preview text is required." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "Voice preview text is too long." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const requestedVoice = body.voice?.trim().toLowerCase() || process.env.OPENAI_TTS_VOICE || "alloy";
  const voice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : "alloy";

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input: text,
      format: "mp3",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: `Voice generation failed (${response.status}).`, detail: detail.slice(0, 250) }, { status: 502 });
  }

  const audio = await response.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
