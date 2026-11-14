const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function jwtSecret(): string {
  const secret = Deno.env.get("M4ZK_SESSION_SECRET");
  if (!secret || secret.length < 32) throw new Error("M4ZK_SESSION_SECRET must be configured (minimum 32 characters)");
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(jwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueAccessToken(userId: string, sessionId: string, ttlSeconds = 7 * 86400): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    aud: "m4zk-session",
    role: "m4zk_session",
    sub: userId,
    sid: sessionId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  }));
  const unsigned = header + "." + payload;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(unsigned)));
  return unsigned + "." + toBase64Url(signature);
}

export type AccessClaims = { sub: string; sid: string; exp: number; role: string; aud: string };

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(parts[2]),
      encoder.encode(parts[0] + "." + parts[1]),
    );
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(fromBase64Url(parts[1]))) as AccessClaims;
    if (
      !claims.sub || !claims.sid || claims.role !== "m4zk_session" ||
      claims.aud !== "m4zk-session" || !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function hashClientIp(ip: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(ip)));
  return toBase64Url(digest);
}

export async function consumeRateLimit(
  db: any,
  bucket: string,
  limitPerMinute: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const { data, error } = await db.rpc("m4zk_consume_rate_limit", {
    p_bucket: bucket,
    p_window_start: windowStart,
    p_limit: limitPerMinute,
  });
  if (error) throw new Error("rate_limit_unavailable");
  return { allowed: data === true, retryAfter: Math.ceil((windowStart + 60_000 - Date.now()) / 1000) };
}
