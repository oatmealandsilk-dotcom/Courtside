// Is this webhook really from WHOOP? Pure Web Crypto, so Node can test it too.
const enc = new TextEncoder();
/** Compares in the same time whatever the input, so the answer leaks nothing about the secret. */
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
/** WHOOP signs base64(HMAC-SHA256(timestamp + raw body, client secret)) (developer.whoop.com/docs/developing/webhooks). The timestamp is ms since epoch; a 2-hour window covers WHOOP's hour of retries. */
export async function verifyWhoop(raw: string, signature: string | null, timestamp: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!signature || !timestamp || !secret) return false;
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(now - t) > 2 * 3_600_000) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(timestamp + raw)));
  return same(btoa(String.fromCharCode(...mac)), signature.trim());
}
