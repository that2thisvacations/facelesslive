import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type ProviderName = "youtube" | "meta";
type OAuthState = { userId: string; provider: ProviderName; nonce: string; exp: number };

function secret() {
  const value = process.env.PROVIDER_OAUTH_SECRET || process.env.STREAM_CREDENTIAL_SECRET;
  if (!value || value.length < 24) throw new Error("PROVIDER_OAUTH_SECRET must be configured with at least 24 characters.");
  return value;
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function signOAuthState(userId: string, provider: ProviderName) {
  const payload: OAuthState = { userId, provider, nonce: randomBytes(18).toString("hex"), exp: Date.now() + 10 * 60_000 };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(value: string | null, provider: ProviderName): OAuthState | null {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
    if (payload.provider !== provider || !payload.userId || !payload.nonce || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function key() { return createHash("sha256").update(secret()).digest(); }

export function encryptProviderTokens(tokens: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptProviderTokens(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted provider token payload.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const clear = Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]);
  return JSON.parse(clear.toString("utf8")) as Record<string, unknown>;
}

export function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  return value;
}
