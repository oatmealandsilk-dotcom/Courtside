import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 8) throw new Error("APP_SECRET is not set");
  return s;
}
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A tamper-proof token carrying a small payload and an expiry (used for the links in emails). */
export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined | null): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
