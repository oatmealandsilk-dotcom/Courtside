import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import { DEMO_LINK_PREVIEWS } from '@/data/mock/linkPreviews';

/*
 * What a link in a chat looks like as a card: its picture, its title and
 * the site it is on, the way iMessage previews a link. The server reads the
 * page (supabase/functions/link-preview), since a phone asking every site
 * itself would tell each one who is reading and could be pointed anywhere.
 * The picture comes through the server too, for the same reason: the card
 * only ever shows a picture from the function's own address.
 *
 * Kept on the phone (AsyncStorage, which in a browser is the page's
 * localStorage) for a week per address (TikTok's for 12 hours: its picture
 * addresses expire), so a chat opened again draws its cards at once.
 * Signing out clears them. Until the server has the function (or when a
 * page has nothing to show), there is no preview and the card simply shows
 * the site's name: the link still opens.
 */

export type LinkKind = 'tiktok' | 'youtube' | 'instagram' | 'image' | 'link';

export interface LinkPreview {
  url: string;
  title?: string;
  site?: string;
  /** The picture, from the function's own address (or, in the demo, a "demo:" one drawn by the app). */
  image?: string;
  kind: LinkKind;
}

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
const KEY = 'courtside-link-preview:v2:';

/** How long an answer is good for: a card a week (TikTok's half a day), "nothing to show" six hours, a passing failure ten minutes (never written down). */
const TTL = { preview: WEEK, tiktok: 12 * HOUR, none: 6 * HOUR, failed: 10 * 60 * 1000 } as const;

type Stored = { at: number; ttl: number; preview: LinkPreview | null };

const memory = new Map<string, Stored>();
const asking = new Map<string, Promise<LinkPreview | null>>();
const listeners = new Map<string, Set<(p: LinkPreview | null) => void>>();
/** Addresses whose picture failed to load and were asked again once already (this session). */
const retried = new Set<string>();
/** The server has no link-preview function yet (it answered 404): no more asking for a while. */
let missingUntil = 0;

/** The address the function's pictures come from, when the app talks to a server. */
const PICTURES = (() => {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, '')}/functions/v1/link-preview?image=` : null;
})();

/** The kind of site an address is on, known before the server answers. */
export function kindOf(url: string): LinkKind {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'link'; }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') return 'instagram';
  if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url)) return 'image';
  return 'link';
}

/** Query words that mark a one-time or private link (a sign-in or reset link, a signed download); the function keeps the same list. */
const SECRET_PARAMS = /^(token|access_token|id_token|refresh_token|auth|authorization|code|otp|key|apikey|api_key|sig|signature|password|pass|pwd|secret|session|sid|reset|magic|invite|ticket|nonce)$/i;

/**
 * Whether an address looks like one only its owner should open. It is never
 * sent to the server to be read (reading it could use it up, and it would sit
 * in the site's logs): it gets the plain card.
 */
export function looksSecret(url: string): boolean {
  try {
    const u = new URL(url);
    for (const name of u.searchParams.keys()) if (SECRET_PARAMS.test(name)) return true;
    return /\/(reset|verify|magic|login|signin|sign-in|confirm|unsubscribe)[-_/]?(password|link|email|token)?\/[A-Za-z0-9_-]{20,}/i.test(u.pathname);
  } catch {
    return true;
  }
}

/** Only what the card may show: a picture from the function itself (the demo's own drawings in the demo), short words. */
function clean(raw: unknown, url: string): LinkPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : undefined);
  const image = typeof r.image === 'string' && (supabase ? !!PICTURES && r.image.startsWith(PICTURES) : r.image.startsWith('demo:')) ? r.image : undefined;
  const kind = (['tiktok', 'youtube', 'instagram', 'image', 'link'] as const).find((k) => k === r.kind) ?? kindOf(url);
  const preview: LinkPreview = { url, title: text(r.title, 160), site: text(r.site, 60), image, kind };
  return preview.title || preview.image ? preview : null;
}

const ttlFor = (preview: LinkPreview | null) => (!preview ? TTL.none : preview.kind === 'tiktok' ? TTL.tiktok : TTL.preview);

function settle(url: string, preview: LinkPreview | null, ttl: number, keep: boolean) {
  const stored: Stored = { at: Date.now(), ttl, preview };
  memory.set(url, stored);
  if (keep) void AsyncStorage.setItem(KEY + url, JSON.stringify(stored)).catch(() => undefined);
  listeners.get(url)?.forEach((fn) => fn(preview));
}

const fresh = (s: Stored | undefined): s is Stored => !!s && typeof s.ttl === 'number' && Date.now() - s.at < s.ttl;

/** What went wrong asking, and so how long to leave it before asking again. */
class Passing extends Error {}

async function ask(url: string): Promise<LinkPreview | null> {
  // The demo has no server: its few links have their previews written out, after a moment, as a fetch would take.
  if (!supabase) {
    const demo = DEMO_LINK_PREVIEWS[url];
    await new Promise((r) => setTimeout(r, demo ? 650 : 200));
    return demo ? clean(demo, url) : null;
  }
  // The function is not there yet: nothing is written down, so once it is, the cards come.
  if (Date.now() < missingUntil) throw new Error('link-preview is not deployed yet');
  // Posted, not put in the address: what someone sent in a private chat stays out of the server's request logs.
  const { data, error } = await supabase.functions.invoke('link-preview', { body: { url }, timeout: 8000 });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 404) missingUntil = Date.now() + 30 * 60 * 1000;
    // The page will not be opened (a private address, not a web page): "nothing to show", for hours.
    if (status === 422) return null;
    // A dead page, a slow one, too many at once: tried again in a few minutes.
    if (status === 502 || status === 429 || (status && status >= 500)) throw new Passing(String(status));
    // Signed out, offline, not deployed: nothing written down at all.
    throw error;
  }
  return clean(data, url);
}

/** Old cards cleared out once per start, so the phone never piles up a card for every link ever seen. */
let swept = false;
function sweep() {
  if (swept) return;
  swept = true;
  void (async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('courtside-link-preview:'));
      if (!keys.length) return;
      const stale: string[] = [];
      for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
        if (!key.startsWith(KEY)) { stale.push(key); continue; }
        try { if (!fresh(JSON.parse(raw ?? 'null') as Stored)) stale.push(key); } catch { stale.push(key); }
      }
      if (stale.length) await AsyncStorage.multiRemove(stale);
    } catch { /* Tidying up can wait for the next start. */ }
  })();
}

/** Reads (or fetches) one address's preview; callers share one request per address. */
function load(url: string): Promise<LinkPreview | null> {
  const now = memory.get(url);
  if (fresh(now)) return Promise.resolve(now.preview);
  const going = asking.get(url);
  if (going) return going;
  sweep();
  const run = (async () => {
    // A one-time or private-looking link is never sent off to be read.
    if (looksSecret(url)) { settle(url, null, WEEK, false); return null; }
    try {
      const raw = await AsyncStorage.getItem(KEY + url).catch(() => null);
      if (raw) {
        const kept = JSON.parse(raw) as Stored;
        if (fresh(kept)) { memory.set(url, kept); return kept.preview; }
        void AsyncStorage.removeItem(KEY + url).catch(() => undefined);
      }
    } catch { /* A broken copy is fetched again. */ }
    try {
      const preview = await ask(url);
      settle(url, preview, ttlFor(preview), true);
      return preview;
    } catch (e) {
      if (e instanceof Passing) {
        // Kept in memory for a few minutes, so every chat opened meanwhile does not ask again.
        settle(url, null, TTL.failed, false);
      } else {
        // Offline, signed out, the function not there yet: asked again next time.
        listeners.get(url)?.forEach((fn) => fn(null));
        memory.delete(url);
      }
      return null;
    } finally {
      asking.delete(url);
    }
  })();
  asking.set(url, run);
  return run;
}

/**
 * A card's picture would not load (TikTok's picture addresses expire after
 * a day or so): the preview is thrown away and asked for again, once per
 * address each time the app runs, so a fresh picture address comes back.
 */
export function refreshLinkPreview(url: string) {
  if (retried.has(url) || !supabase) return;
  retried.add(url);
  memory.delete(url);
  void AsyncStorage.removeItem(KEY + url).catch(() => undefined);
  void load(url).then((p) => listeners.get(url)?.forEach((fn) => fn(p)));
}

/** Signing out: no card of this account's chats stays on the device for the next person. */
export async function forgetLinkPreviews() {
  memory.clear();
  retried.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('courtside-link-preview:'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* Nothing more to do. */ }
}

/** A preview already in memory (drawn at once, with no fade), else undefined. */
export function knownPreview(url: string): LinkPreview | null | undefined {
  const now = memory.get(url);
  return fresh(now) ? now.preview : undefined;
}

/**
 * One link's preview for a card: `undefined` while it is being read, `null`
 * when there is none to show (the card then shows the site's name), or the
 * preview. A card scrolled past and back reads it from memory at once.
 */
export function useLinkPreview(url: string | null): LinkPreview | null | undefined {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(() => (url ? knownPreview(url) : null));
  useEffect(() => {
    if (!url) { setPreview(null); return undefined; }
    let on = true;
    const now = memory.get(url);
    if (fresh(now)) setPreview(now.preview);
    else {
      setPreview(undefined);
      void load(url).then((p) => { if (on) setPreview(p); });
    }
    const set = listeners.get(url) ?? new Set();
    const hear = (p: LinkPreview | null) => { if (on) setPreview(p); };
    set.add(hear);
    listeners.set(url, set);
    return () => { on = false; set.delete(hear); };
  }, [url]);
  return preview;
}
