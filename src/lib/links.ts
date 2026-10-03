import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/*
 * Links in what people write: found the way iMessage and Instagram find them
 * (an address with http:// or https://, one starting www., or a bare
 * domain such as courtsidebase.com), so they can be tapped and previewed.
 *
 * A bare domain only counts with an ending people really use for websites:
 * "done.so" or "in.it", typed without a space after the full stop, stay
 * words. Written without lookbehind on purpose: older iPhone browsers
 * cannot read a pattern that has one, and the whole app would fail to load.
 */

/** Endings a bare domain may have and still be taken for a website. Two-letter words ("so", "in", "it", "me"…) are left out. */
const BARE_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'app', 'dev', 'ai', 'tv', 'fm', 'gg', 'ly', 'info', 'biz', 'xyz', 'club',
  'tennis', 'blog', 'news', 'shop', 'store', 'site', 'online', 'page', 'link', 'live', 'tech', 'pro', 'team', 'social',
  'video', 'fit', 'fitness', 'coach', 'sport', 'sports', 'events', 'world', 'media', 'studio', 'design', 'nyc', 'london',
  'paris', 'eu', 'uk', 'au', 'ca', 'nz', 'ie', 'de', 'fr', 'es', 'nl', 'ch', 'se', 'dk', 'fi', 'pt', 'pl', 'cz', 'jp',
  'kr', 'cn', 'br', 'mx', 'ar', 'cl', 'za', 'sg', 'hk', 'tw', 'ru', 'ua', 'gr', 'tr', 'il', 'ae', 'sa', 'ph', 'vn', 'th',
  'id', 'my', 'pk', 'ng', 'ke', 'eg', 'ma', 'ro', 'hu', 'sk', 'si', 'hr', 'rs', 'bg', 'lt', 'lv', 'ee', 'cc', 'ws', 'gl',
]);

/** Short-link sites whose ending is one of those left-out words: they are links wherever they appear. */
const SHORT_HOSTS = new Set(['youtu.be', 'instagr.am', 'amzn.to', 'wa.me', 't.me', 'fb.me', 'm.me', 'on.be']);

/** Anything that looks like an address: with a scheme, starting www., or a bare dotted name with an optional path. */
const CANDIDATE = /\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?::\d{2,5})?(?:[/?#][^\s<>"]*)?/gi;

export interface FoundLink {
  /** Exactly what was written ("courtsidebase.com/join"). */
  text: string;
  /** Where it goes, with its scheme ("https://courtsidebase.com/join"). */
  url: string;
  /** Where in the words it starts. */
  start: number;
}

/** The longest address taken for a link; anything longer is left as plain words. */
const MAX_LINK = 2048;

/**
 * Trailing marks off the end: sentence marks always, and a closing bracket
 * unless the address opened one ("wikipedia.org/wiki/Clay_(court)"). The
 * brackets are counted once, then kept up to date while trimming, so a long
 * run of ")))" costs one pass, not one pass per bracket.
 */
function trimEnd(text: string): string {
  const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const opens: Record<string, number> = { '(': 0, '[': 0, '{': 0 };
  const closes: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
  for (const ch of text) {
    if (ch in opens) opens[ch] += 1;
    else if (ch in closes) closes[ch] += 1;
  }
  let end = text.length;
  while (end > 0) {
    const ch = text[end - 1];
    if (/[.,!?;:'"\u2019\u201d\u2026*_~]/.test(ch)) { end -= 1; continue; }
    const open = PAIRS[ch];
    if (open && closes[ch] > opens[open]) { closes[ch] -= 1; end -= 1; continue; }
    break;
  }
  return text.slice(0, end);
}

/** The address with its scheme, or null if it is not a web address at all. */
export function normalizeUrl(text: string): string | null {
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Every link in some words, in order. */
export function findLinks(body: string): FoundLink[] {
  if (!body || body.indexOf('.') < 0) return [];
  const found: FoundLink[] = [];
  CANDIDATE.lastIndex = 0;
  for (let m = CANDIDATE.exec(body); m; m = CANDIDATE.exec(body)) {
    const raw = m[0];
    const start = m.index;
    const before = start > 0 ? body[start - 1] : '';
    // An email address ("sam@club.com"), a handle ("@club.tennis") or a hashtag ("#tennis.club") is not a link.
    if (before === '@' || before === '.' || before === '/' || before === '#') continue;
    if (raw.length > MAX_LINK) continue;
    const text = trimEnd(raw);
    if (!text) continue;
    const scheme = /^https?:\/\//i.test(text);
    if (!scheme) {
      // A bare name, or one starting www.: its ending must be a real website ending ("www.example" is not one), and it must not be part of an email.
      const host = text.split(/[/?#:]/)[0];
      const tld = host.slice(host.lastIndexOf('.') + 1).toLowerCase();
      if (!BARE_TLDS.has(tld) && !SHORT_HOSTS.has(host.toLowerCase()) && !(/^www\./i.test(host) && /^[a-z]{2,24}$/.test(tld) && host.split('.').length > 2)) continue;
      if (body[start + raw.length] === '@') continue;
    }
    const url = normalizeUrl(text);
    if (url) found.push({ text, url, start });
  }
  return found;
}

/** The first link in some words, if there is one. */
export function firstLink(body: string): FoundLink | null {
  return findLinks(body)[0] ?? null;
}

/** The words are one link and nothing else (shown as a preview card on its own, as iMessage does). */
export function isOnlyLink(body: string): FoundLink | null {
  const trimmed = body.trim();
  const links = findLinks(trimmed);
  return links.length === 1 && links[0].text === trimmed ? links[0] : null;
}

/** "tiktok.com" for https://www.tiktok.com/@x/video/1: the name people know a site by. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').replace(/^m\./i, '');
  } catch {
    return url;
  }
}

/** Splits words into plain runs and links, in order, for drawing them. */
export function splitLinks(body: string): { text: string; url?: string }[] {
  const links = findLinks(body);
  if (!links.length) return [{ text: body }];
  const parts: { text: string; url?: string }[] = [];
  let at = 0;
  for (const link of links) {
    if (link.start > at) parts.push({ text: body.slice(at, link.start) });
    parts.push({ text: link.text, url: link.url });
    at = link.start + link.text.length;
  }
  if (at < body.length) parts.push({ text: body.slice(at) });
  return parts;
}

let lastOpen = { url: '', at: 0 };

/**
 * Opens a link without leaving CourtSide: Safari's own sheet on an iPhone
 * (Chrome's on Android), with Done to come straight back to the chat; a new
 * tab in a browser, so the chat stays where it was.
 */
export function openLink(url: string) {
  // A quick second tap (a double tap, a bounce) opens it once, not twice: a phone turns the second away, a browser opens two tabs.
  const now = Date.now();
  if (lastOpen.url === url && now - lastOpen.at < 700) return;
  lastOpen = { url, at: now };
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'done', enableBarCollapsing: true }).catch(() => undefined);
}
