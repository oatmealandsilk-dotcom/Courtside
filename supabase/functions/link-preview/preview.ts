// CourtSide — what a link looks like as a card: its title, its picture and
// the site it is on. The reading itself, kept apart from the web server in
// index.ts so it can be tried on any computer with a pretend internet:
// nothing in here touches Deno, a database or the real network except
// through the `fetch` and `resolve` it is handed.
//
// The rules that keep it from being pointed somewhere it must not go (the
// whole reason the app asks the server rather than reading pages itself):
//   - only http:// and https:// addresses, on the usual ports, with no
//     user name or password in them;
//   - never a name that only means something inside a network (localhost,
//     *.local, *.internal, a name with no dot) and never a private,
//     loopback, link-local, carrier or cloud-metadata address, checked on
//     every address the name resolves to, before every request;
//   - at most 3 redirects, each one checked the same way;
//   - 4 seconds for the whole thing and 1.5 MB read at most.

export type Kind = 'tiktok' | 'youtube' | 'instagram' | 'image' | 'link';

/** What the app is sent back. Every field but url and kind may be missing. */
export interface Preview {
  url: string;
  title?: string;
  site?: string;
  image?: string;
  kind: Kind;
}

export interface Deps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /**
   * Every IPv4 and IPv6 address a host name resolves to: empty when the name
   * does not exist, a thrown error when the lookup itself failed (no answer
   * in time, the resolver unreachable), which is not the same thing.
   */
  resolve: (host: string, signal?: AbortSignal) => Promise<string[]>;
}

export const LIMITS = { timeoutMs: 4000, maxBytes: 1_500_000, maxRedirects: 3 } as const;

/** How much of a page's start is read for its tags: plenty for any real <head>, and the most the reading below ever looks at. */
export const HEAD_MAX = 256_000;

const USER_AGENT = 'Mozilla/5.0 (compatible; CourtSideLinkPreview/1.0; +https://courtsidebase.com)';

/** A link the function will not open (a private address, a strange port…): the app shows the plain card. */
export class Refused extends Error {}

/* ------------------------------------------------------------ addresses */

/** Names that only mean something inside a network, never on the public internet. */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa', '.intranet', '.corp', '.private', '.localdomain'];

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost') return true;
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return true;
  // An IP written out is judged by the address itself; any other name needs a dot ("router", "metadata" do not count).
  if (ipVersion(host)) return false;
  return !host.includes('.');
}

/** 4 or 6 for an IP address as written (IPv6 without its brackets), else 0. */
export function ipVersion(text: string): 0 | 4 | 6 {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return 4;
  if (text.includes(':') && /^[0-9a-f:.]+$/i.test(text)) return 6;
  return 0;
}

function v4Octets(ip: string): number[] | null {
  const parts = ip.split('.').map((p) => Number(p));
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
}

/** Whether an IPv4 address is on the public internet (not private, loopback, link-local, carrier, test or multicast). */
export function isPublicV4(ip: string): boolean {
  const o = v4Octets(ip);
  if (!o) return false;
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, and the cloud metadata address 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast and reserved, the broadcast address too
  return true;
}

/** An IPv6 address as eight numbers (null if it is not one). An IPv4 tail ("::ffff:10.0.0.1") becomes the last two. */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const o = v4Octets(tail[1]);
    if (!o) return null;
    text = `${text.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((n) => Number.isFinite(n)) ? groups : null;
}

/** Whether an IPv6 address is a public one (global unicast, and not one that wraps a private IPv4 address). */
export function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::ffff:a.b.c.d (IPv4 written as IPv6) and 64:ff9b::a.b.c.d (NAT64): judged by the IPv4 address inside.
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return isPublicV4(v4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) return isPublicV4(v4(g[6], g[7]));
  // Only global unicast (2000::/3) is public at all; inside it, a few blocks are not.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23: Teredo, benchmarking, ORCHID and other special blocks
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2002) return false; // 6to4, which can wrap any IPv4 address
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // documentation (3fff::/20)
  return true;
}

export function isPublicIp(ip: string): boolean {
  const version = ipVersion(ip);
  return version === 4 ? isPublicV4(ip) : version === 6 ? isPublicV6(ip) : false;
}

/**
 * The address the app asked about, if it is one the function will open: http
 * or https, the usual port, no user name or password, a public-looking name.
 */
export function parseTarget(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host)) return null;
  if (ipVersion(host) && !isPublicIp(host)) return null;
  url.hash = '';
  return url;
}

/** Checks a host before every request: an IP must be public, and so must every address a name resolves to. */
export async function assertPublicHost(url: URL, deps: Deps, signal?: AbortSignal): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isBlockedHostname(host)) throw new Refused(`blocked name ${host}`);
  if (ipVersion(host)) {
    if (!isPublicIp(host)) throw new Refused(`private address ${host}`);
    return;
  }
  const addresses = await deps.resolve(host, signal);
  if (!addresses.length) throw new Refused(`no address for ${host}`);
  for (const a of addresses) if (!isPublicIp(a)) throw new Refused(`${host} points at a private address`);
}

/* ------------------------------------------------------------- fetching */

/**
 * Fetches an address, following at most 3 redirects by hand, each one
 * checked before it is followed.
 */
export async function safeFetch(start: URL, deps: Deps, signal: AbortSignal, accept: string): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; ; hop += 1) {
    await assertPublicHost(url, deps, signal);
    const res = await deps.fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel().catch(() => undefined);
      if (hop >= LIMITS.maxRedirects) throw new Refused('too many redirects');
      const next = parseTarget(new URL(res.headers.get('location')!, url).toString());
      if (!next) throw new Refused('redirect to an address that is not allowed');
      url = next;
      continue;
    }
    // Asked again once the answer is in: a name that pointed somewhere public
    // for the check and somewhere private for the fetch (DNS rebinding) is
    // caught here, unless it flips back in between. Its answer is thrown away.
    try {
      await assertPublicHost(url, deps, signal);
    } catch (e) {
      await res.body?.cancel().catch(() => undefined);
      throw e;
    }
    return { res, url };
  }
}

/** The first `max` bytes of a response, then it stops reading. */
export async function readCapped(res: Response, max: number = LIMITS.maxBytes): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const room = max - size;
      chunks.push(value.length > room ? value.subarray(0, room) : value);
      size += Math.min(value.length, room);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* -------------------------------------------------------------- reading */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const tidy = (text: string | undefined, max: number) => {
  if (!text) return undefined;
  const clean = decodeEntities(text.length > 4096 ? text.slice(0, 4096) : text).replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/**
 * The page's own picture, made absolute; only an https one, on a public name
 * or a public IP, is kept. (The app never loads it from there itself: the
 * function hands it on through its own picture address, see index.ts.)
 */
export function httpsImage(raw: string | undefined, base: URL): string | undefined {
  if (!raw || raw.length > 2048) return undefined;
  try {
    const url = new URL(decodeEntities(raw.trim()), base);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    if (url.port && url.port !== '443') return undefined;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isBlockedHostname(host)) return undefined;
    if (ipVersion(host) && !isPublicIp(host)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** A–Z to a–z and nothing else, so every place in it is the same place in the original (toLowerCase can change a string's length). */
const asciiLower = (text: string) => text.replace(/[A-Z]+/g, (run) => run.toLowerCase());

/**
 * The page with what can hide a tag taken out: <!-- comments -->, and the
 * insides of <script> and <style>. One pass, never going back over what it
 * has read; an unclosed one runs to the end and takes the rest with it.
 */
export function stripHidden(html: string): string {
  const lower = asciiLower(html);
  let out = '';
  let at = 0;
  for (;;) {
    const comment = lower.indexOf('<!--', at);
    const script = lower.indexOf('<script', at);
    const style = lower.indexOf('<style', at);
    const starts = [comment, script, style].filter((n) => n >= 0);
    if (!starts.length) return out + html.slice(at);
    const start = Math.min(...starts);
    out += html.slice(at, start);
    const close = start === comment ? '-->' : start === script ? '</script' : '</style';
    const end = lower.indexOf(close, start + 4);
    if (end < 0) return out;
    // Past the closing mark, and past its ">" for </script> and </style>.
    const gt = close === '-->' ? end + 3 : lower.indexOf('>', end);
    if (gt < 0) return out;
    at = close === '-->' ? gt : gt + 1;
  }
}

/** A tag's attributes, from one short tag (at most 2 KB, so the pattern below has little to go over). */
function attributesOf(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]{1,64})\s{0,8}=\s{0,8}(?:"([^"]{0,2048})"|'([^']{0,2048})'|([^\s"'>]{1,2048}))/g)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * What a page says about itself in its <head>: Open Graph first, then
 * Twitter's tags, then its <title>. Read with a plain scanner, not open-ended
 * patterns: a page built to make a pattern run for minutes (a <meta with no
 * end, a <title that never closes) costs no more than reading it once.
 */
export function parseHtml(html: string, base: URL): { title?: string; description?: string; image?: string; site?: string } {
  let head = html.length > HEAD_MAX ? html.slice(0, HEAD_MAX) : html;
  head = stripHidden(head);
  const lowerAll = asciiLower(head);
  const end = lowerAll.indexOf('</head');
  if (end > 0) head = head.slice(0, end);
  const lower = end > 0 ? lowerAll.slice(0, end) : lowerAll;

  const meta = new Map<string, string>();
  for (let from = 0; ;) {
    const i = lower.indexOf('<meta', from);
    if (i < 0) break;
    const after = lower[i + 5];
    if (after !== undefined && !/[\s/>]/.test(after)) { from = i + 5; continue; }
    const close = lower.indexOf('>', i);
    if (close < 0) break; // No tag anywhere after this one is finished.
    // Every <meta between here and that ">" ends at it too, so a tag too long to be real is skipped with all of them.
    if (close - i > 2048) { from = close + 1; continue; }
    const attrs = attributesOf(head.slice(i + 5, close));
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
    from = close + 1;
  }

  let titleTag: string | undefined;
  const t = lower.indexOf('<title');
  if (t >= 0) {
    const open = lower.indexOf('>', t);
    if (open > 0 && open - t <= 256) {
      const shut = lower.indexOf('</title', open);
      const stop = shut < 0 ? Math.min(head.length, open + 1 + 1024) : Math.min(shut, open + 1 + 1024);
      titleTag = head.slice(open + 1, stop);
    }
  }

  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v && v.trim());
  return {
    title: tidy(pick('og:title', 'twitter:title') ?? titleTag, 160),
    description: tidy(pick('og:description', 'twitter:description', 'description'), 200),
    image: httpsImage(pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), base),
    site: tidy(pick('og:site_name', 'application-name'), 60),
  };
}

/** A page's text in its own character set (UTF-8 unless it says otherwise). */
function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const sniff = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const fromMeta = sniff.match(/<meta[^>]{0,256}charset=["']?([\w-]{1,40})/i)?.[1];
  const label = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
  try { return new TextDecoder(label).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

/* ---------------------------------------------------------------- kinds */

const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

export function kindOf(url: URL): Kind {
  const host = url.hostname.toLowerCase();
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') return 'instagram';
  return 'link';
}

/** TikTok and YouTube answer a public oEmbed question with the title, the author and a picture. */
async function oEmbed(endpoint: string, url: URL, deps: Deps, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  const ask = new URL(endpoint);
  ask.searchParams.set('url', url.toString());
  if (endpoint.includes('youtube')) ask.searchParams.set('format', 'json');
  const { res } = await safeFetch(ask, deps, signal, 'application/json');
  if (!res.ok) { await res.body?.cancel().catch(() => undefined); return null; }
  const bytes = await readCapped(res, 200_000);
  try { return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; } catch { return null; }
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A TikTok video's full address ("tiktok.com/@who/video/123"), the only kind TikTok's oEmbed answers for. */
const TIKTOK_VIDEO = /^\/@[^/]{1,64}\/video\/\d{1,30}\/?$/;

/**
 * TikTok's Share → Copy link gives a short address (vm.tiktok.com/ZM…,
 * tiktok.com/t/ZT…) that only redirects to the video's full one. Followed
 * here (each hop checked, nothing read), so oEmbed can be asked about the
 * video itself. Anything that does not land on a video is left as it was.
 */
export async function canonicalTikTok(target: URL, deps: Deps, signal: AbortSignal): Promise<URL> {
  if (TIKTOK_VIDEO.test(target.pathname)) return target;
  try {
    const { res, url } = await safeFetch(target, deps, signal, 'text/html');
    await res.body?.cancel().catch(() => undefined);
    if (kindOf(url) === 'tiktok' && TIKTOK_VIDEO.test(url.pathname)) return new URL(`https://www.tiktok.com${url.pathname}`);
  } catch (e) {
    if (e instanceof Refused) throw e;
  }
  return target;
}

/** Instagram's own oEmbed needs a Facebook app token: a clean card with what the address itself says. */
function instagramCard(url: URL): Preview {
  const path = url.pathname;
  const title = /^\/(reel|reels)\//.test(path) ? 'Instagram reel'
    : /^\/(p|tv)\//.test(path) ? 'Instagram post'
    : /^\/stories\//.test(path) ? 'Instagram story'
    : (() => { const handle = path.split('/').filter(Boolean)[0]; return handle && /^[\w.]{1,30}$/.test(handle) ? `@${handle} on Instagram` : 'Instagram'; })();
  return { url: url.toString(), title, site: 'instagram.com', kind: 'instagram' };
}

/**
 * The preview for one address. Throws Refused for an address it will not
 * open, and anything else (a timeout, a dead page) when it could not read it.
 */
export async function buildPreview(target: URL, deps: Deps, signal: AbortSignal = AbortSignal.timeout(LIMITS.timeoutMs)): Promise<Preview> {
  const kind = kindOf(target);
  const url = target.toString();

  if (kind === 'instagram') return instagramCard(target);

  if (kind === 'tiktok' || kind === 'youtube') {
    const about = kind === 'tiktok' ? await canonicalTikTok(target, deps, signal) : target;
    const data = await oEmbed(kind === 'tiktok' ? 'https://www.tiktok.com/oembed' : 'https://www.youtube.com/oembed', about, deps, signal).catch((e) => {
      if (e instanceof Refused) throw e;
      return null;
    });
    if (data) {
      const author = str(data.author_unique_id) ? `@${str(data.author_unique_id)}` : str(data.author_name);
      const name = kind === 'tiktok' ? 'TikTok' : 'YouTube';
      return {
        url,
        title: tidy(str(data.title), 160) ?? (author ? `${author} on ${name}` : name),
        site: tidy(author ? `${name} · ${author}` : name, 60),
        image: httpsImage(str(data.thumbnail_url), new URL('https://www.tiktok.com/')),
        kind,
      };
    }
    // No answer from oEmbed: the page itself, like any other.
  }

  const { res, url: landed } = await safeFetch(target, deps, signal, 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5');
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`page answered ${res.status}`);
  }
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (type.startsWith('image/')) {
    await res.body?.cancel().catch(() => undefined);
    return { url, image: httpsImage(landed.toString(), landed), site: hostOf(landed), kind: 'image' };
  }
  if (!type.includes('html')) {
    await res.body?.cancel().catch(() => undefined);
    return { url, site: hostOf(landed), kind };
  }
  // Only the start of a page is ever read for its tags (HEAD_MAX characters), so no more than that is downloaded.
  const page = parseHtml(decodeHtml(await readCapped(res, Math.min(LIMITS.maxBytes, HEAD_MAX * 2)), type), landed);
  return {
    url,
    title: page.title ?? page.description,
    site: page.site ?? hostOf(landed),
    image: page.image,
    kind,
  };
}

/* ------------------------------------------------------------- privacy */

/** Query words that mark a one-time or private link (a sign-in or reset link, a signed download). */
const SECRET_PARAMS = /^(token|access_token|id_token|refresh_token|auth|authorization|code|otp|key|apikey|api_key|sig|signature|password|pass|pwd|secret|session|sid|reset|magic|invite|ticket|nonce)$/i;

/**
 * Whether an address looks like one only its owner should open: opening it
 * to read its card could use it up (a one-time sign-in link) or hand it to
 * the site's logs. Such a link gets the plain card and is never fetched.
 */
export function looksSecret(url: URL): boolean {
  for (const name of url.searchParams.keys()) if (SECRET_PARAMS.test(name)) return true;
  return /\/(reset|verify|magic|login|signin|sign-in|confirm|unsubscribe)[-_/]?(password|link|email|token)?\/[A-Za-z0-9_-]{20,}/i.test(url.pathname);
}

/* ------------------------------------------------------------- pictures */

/** The picture types a card may show (no SVG: it is a document that can carry scripts, not a picture). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

/**
 * A card's picture, fetched by the function so the phone showing it never
 * contacts the page's server (which would tell whoever sent the link when it
 * was looked at, and from where). Same rules as a page: public addresses
 * only, each redirect checked, 4 seconds, 1.5 MB, and only a real picture type.
 */
export async function fetchImage(target: URL, deps: Deps, signal: AbortSignal = AbortSignal.timeout(LIMITS.timeoutMs)): Promise<{ bytes: Uint8Array; type: string }> {
  if (target.protocol !== 'https:') throw new Refused('pictures are https only');
  const { res } = await safeFetch(target, deps, signal, 'image/avif,image/webp,image/jpeg,image/png,image/gif;q=0.9');
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`picture answered ${res.status}`);
  }
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) {
    await res.body?.cancel().catch(() => undefined);
    throw new Refused(`not a picture (${type || 'no type'})`);
  }
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > LIMITS.maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new Refused('picture too large');
  }
  // One byte past the limit tells a picture that was cut short from one that fits.
  const bytes = await readCapped(res, LIMITS.maxBytes + 1);
  if (bytes.length > LIMITS.maxBytes) throw new Refused('picture too large');
  if (!bytes.length) throw new Error('empty picture');
  return { bytes, type: type === 'image/jpg' ? 'image/jpeg' : type };
}

const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`link-preview-image:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** The function's own mark on a picture address it vouched for, so its picture route only ever serves those. */
export async function signImage(secret: string, image: string): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(image)));
}

export async function verifyImage(secret: string, image: string, sig: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', await hmacKey(secret), raw, new TextEncoder().encode(image));
}
