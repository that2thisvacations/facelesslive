import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VOICES = new Set(["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"]);

type SpeechRequest = { text?: string; voice?: string };

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!url || !anonKey || !apiKey) return NextResponse.json({ error: "Live speech services are not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: SpeechRequest;
  try { body = (await request.json()) as SpeechRequest; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const text = body.text?.trim();
  const voice = VOICES.has(body.voice || "") ? body.voice! : process.env.OPENAI_TTS_VOICE || "alloy";
  if (!text) return NextResponse.json({ error: "Speech text is required." }, { status: 400 });
  if (text.length > 800) return NextResponse.json({ error: "Live speech text is too long." }, { status: 400 });

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice,
        input: text,
        response_format: "mp3",
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json({ error: `Speech provider returned ${response.status}.`, detail: detail.slice(0, 300) }, { status: 502 });
    }
    const audio = await response.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(audio.byteLength),
      },
    });
  } catch (speechError) {
    return NextResponse.json({ error: speechError instanceof Error ? speechError.message : "Unable to synthesize live speech." }, { status: 502 });
  }
}
