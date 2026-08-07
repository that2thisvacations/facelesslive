import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptStreamCredentials(value: object, secret: string) {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptStreamCredentials<T>(payload: string, secret: string): T {
  const [ivText, tagText, dataText] = payload.split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Invalid encrypted credential payload.");

  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted) as T;
}
