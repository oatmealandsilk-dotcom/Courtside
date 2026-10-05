// Shared by the server functions that cost money each time they run: a
// server-side "not so often", kept in the database (migration 99,
// take_edge_rate), so it holds whatever app, script or copy of the website
// is calling. Limits set in the app itself can be skipped by anyone who calls
// the function directly; these cannot.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Takes one use from a bucket ("welcome-ip", "ai-chat"...) for a key (a
 * hashed address, or "all" for everyone together): true when it was allowed
 * (and is now counted), false when the limit is reached. Before migration 99
 * has run there is nothing to count against, so everything is allowed, as
 * before; any other database trouble is allowed too (and logged), so a hiccup
 * never takes a feature down.
 */
export async function takeRate(admin: SupabaseClient, bucket: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc('take_edge_rate', { p_bucket: bucket, p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    if (error.code !== 'PGRST202') console.error('[rate]', bucket, error.message);
    return true;
  }
  return data === true;
}

/**
 * The caller's internet address, as the platform in front of the function
 * reports it, scrambled one way (SHA-256) so the address itself is never
 * stored. "unknown" when there is none.
 */
export async function callerKey(req: Request): Promise<string> {
  const raw = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? '';
  const ip = raw.trim();
  if (!ip) return 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`courtside:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
