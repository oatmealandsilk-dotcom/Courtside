// CourtSide — link previews for chat messages (a Supabase Edge Function).
//
// The app asks   POST /functions/v1/link-preview   {"url": "<address>"}
//   (GET ?url=<address> works too; the app posts, so the address a person
//   sent in a private chat never lands in the server's request logs)
// and gets back  {url, title, site, image, kind}
// for the card a link shows as in a chat (iMessage's preview): the page's
// title and picture, read from its Open Graph / Twitter tags or <title>;
// TikTok and YouTube through their public oEmbed; Instagram (whose oEmbed
// needs a Facebook app token) as a clean "Instagram" card from the address.
//
// The picture comes back as this function's own address
//   GET /functions/v1/link-preview?image=<picture address>&sig=<mark>
// which fetches it and hands it on, so a phone showing the card never
// contacts the page's server (that would tell whoever sent the link when the
// chat was opened, and roughly where from, read receipts off or not). The
// mark is a signature only this function can make, so the picture route
// serves only pictures it vouched for; it needs no login, since the phone's
// picture loader sends none.
//
// Only a signed-in player can ask for a preview (their login token is
// checked here, the way ai-coach and delete-account check it). The reading
// and every safety rule (public addresses only, 3 redirects, 4 seconds,
// 1.5 MB) are in preview.ts. Answers are kept in memory for a few hours
// (most recent 500).
//
// Deploy:   npx supabase functions deploy link-preview --no-verify-jwt
// --no-verify-jwt because the picture route is loaded with no login (its
// signature is its pass) and the preview route checks the login itself.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided;
// no secrets to set. Until it is deployed the app shows a plain card with
// the site's name, and links still open.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildPreview, fetchImage, looksSecret, parseTarget, Refused, signImage, verifyImage, type Deps, type Preview } from './preview.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status: number, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json', 'cache-control': maxAge ? `private, max-age=${maxAge}` : 'no-store' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const auth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
/** What the picture addresses are signed with. Without it, cards simply come without pictures. */
const SIGNING = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Where the app reaches this function from outside (the picture addresses point here). */
const SELF = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/link-preview`;

/**
 * Every address a name resolves to, IPv4 and IPv6 asked together, inside the
 * request's 4 seconds. A name that does not exist gives none; a lookup that
 * failed outright (no answer, no resolver) throws, which reads as "could not
 * read it, try later", never as "a private address".
 */
async function resolve(host: string, signal?: AbortSignal): Promise<string[]> {
  const [a, aaaa] = await Promise.allSettled((['A', 'AAAA'] as const).map((type) => Deno.resolveDns(host, type, { signal })));
  const out: string[] = [];
  const failures: unknown[] = [];
  for (const r of [a, aaaa]) {
    if (r.status === 'fulfilled') out.push(...r.value);
    else if (!(r.reason instanceof Deno.errors.NotFound)) failures.push(r.reason);
  }
  if (!out.length && failures.length) throw new Error(`could not look up ${host}`);
  return out;
}

const deps: Deps = { fetch: (input, init) => fetch(input, init), resolve };

/* The last answers, newest last (a Map keeps its order): a few hours for a preview, ten minutes for a failure. */
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; ttl: number; status: number; body: unknown; maxAge: number }>();
function recall(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  if (Date.now() - hit.at > hit.ttl) return null;
  cache.set(key, hit);
  return hit;
}
function remember(key: string, status: number, body: unknown, ttl: number, maxAge: number) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), ttl, status, body, maxAge });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/* Login tokens already checked, so a chat full of links costs one check, not one each. */
const known = new Map<string, { user: string; until: number }>();
async function userOf(token: string): Promise<string | null> {
  const hit = known.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  known.set(token, { user: data.user.id, until: Date.now() + 5 * 60_000 });
  if (known.size > 2000) known.delete(known.keys().next().value!);
  return data.user.id;
}

/* A fair share each: 120 new addresses per person per ten minutes (cached answers are free). */
const asked = new Map<string, number[]>();
function allowed(user: string): boolean {
  const now = Date.now();
  const recent = (asked.get(user) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 120) { asked.set(user, recent); return false; }
  recent.push(now);
  asked.set(user, recent);
  if (asked.size > 5000) asked.delete(asked.keys().next().value!);
  return true;
}

/** The preview as the app gets it: its picture swapped for this function's own address for it (or left out, unsigned). */
async function forApp(preview: Preview): Promise<Preview> {
  if (!preview.image) return preview;
  if (!SIGNING || !SUPABASE_URL) return { ...preview, image: undefined };
  const sig = await signImage(SIGNING, preview.image);
  return { ...preview, image: `${SELF}?image=${encodeURIComponent(preview.image)}&sig=${sig}` };
}

/** TikTok's picture addresses stop working within a day or two: its cards are kept for less time. */
const keepFor = (preview: Preview) => (preview.kind === 'tiktok' ? 2 * 60 * 60_000 : 6 * 60 * 60_000);

/** The picture route: only a picture this function signed, fetched under the same rules as a page. */
async function servePicture(params: URLSearchParams): Promise<Response> {
  const image = params.get('image') ?? '';
  const sig = params.get('sig') ?? '';
  const plain = (status: number) => new Response(null, { status, headers: { ...cors, 'cache-control': status === 404 ? 'public, max-age=3600' : 'no-store' } });
  if (!SIGNING || !image || image.length > 2048 || !(await verifyImage(SIGNING, image, sig).catch(() => false))) return plain(403);
  const target = parseTarget(image);
  if (!target) return plain(403);
  try {
    const { bytes, type } = await fetchImage(target, deps);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...cors,
        'content-type': type,
        // The same address always means the same picture: the phone and the browser keep it a day.
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return plain(e instanceof Refused ? 404 : 502);
  }
}

/** The address the app asked about: in a POST's body, or (older apps, a quick check by hand) ?url=. */
async function askedFor(req: Request, query: URLSearchParams): Promise<string | null> {
  if (req.method === 'GET') return query.get('url');
  try {
    const body = await req.json() as { url?: unknown };
    return typeof body.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);
  const query = new URL(req.url).searchParams;
  if (req.method === 'GET' && query.has('image')) return servePicture(query);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const user = token ? await userOf(token).catch(() => null) : null;
  if (!user) return json({ error: 'Sign in to see link previews' }, 401);

  const target = parseTarget(await askedFor(req, query));
  // A one-time or private-looking link is never opened (it could be used up): the app shows its plain card.
  if (!target || looksSecret(target)) return json({ error: 'Not a link this can open' }, 422, 3600);

  const key = target.toString();
  const hit = recall(key);
  if (hit) return json(hit.body, hit.status, hit.maxAge);
  if (!allowed(user)) return json({ error: 'Too many links at once; try again in a few minutes' }, 429);

  try {
    const preview = await forApp(await buildPreview(target, deps));
    const ttl = keepFor(preview);
    remember(key, 200, preview, ttl, ttl / 1000);
    return json(preview, 200, ttl / 1000);
  } catch (e) {
    if (e instanceof Refused) {
      remember(key, 422, { error: 'Not a link this can open' }, 60 * 60_000, 3600);
      return json({ error: 'Not a link this can open' }, 422, 3600);
    }
    // A timeout, a dead page, a failed lookup, a site that turned the reader away: no card this time, asked again later.
    remember(key, 502, { error: 'Could not read that page' }, 10 * 60_000, 600);
    return json({ error: 'Could not read that page' }, 502, 600);
  }
});
