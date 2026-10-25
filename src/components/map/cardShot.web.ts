import { useSyncExternalStore } from 'react';

/*
 * The browser's twin of cardShot.ts: a picture of the still map card as it
 * last drew, kept in this browser (IndexedDB) and never uploaded. Here only
 * the streets are kept: the browser's pins are live page elements that sit
 * over the picture exactly where the map will draw them (WebMap), so no
 * picture here ever has a person on it.
 */

export type ShotKind = 'streets' | 'card';
export interface CardShot { uri: string; kind: ShotKind }
export interface CardHint { lat: number; lng: number; name: string; at?: number }

interface Entry { key: string; data: string; at: number }

const DB = 'courtside-mapcard';
const STORE = 'shots';
const HINTS = 'courtside-mapcard-hints';
const KEEP = 4;
export const MIN_SHOT_BYTES = 15_000;
/** A picture of the streets alone, and where the card was: a week, so map data and look changes never linger (as on the phone). */
export const PLACE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

let entries: Entry[] = [];
let version = 0;
let loading: Promise<void> | null = null;
let cleared = false;
/** People whose places were forgotten (forgetPlaces): never read back in, should the read finish after. */
const forgotten = new Set<string>();
const listeners = new Set<() => void>();
const tell = () => { version += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useCardShots(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function shotKey(k: { user: string; theme: string; look: string; lat: number; lng: number; zoom: number; w: number; h: number; scale: number; lock: string; still: boolean }): string {
  return [k.user, k.theme, k.look, k.lat.toFixed(4), k.lng.toFixed(4), k.zoom, Math.round(k.w), Math.round(k.h), k.scale, k.lock, k.still ? 1 : 0].join('|');
}

export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE, { keyPath: 'key' }); } catch { /* there already */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
let db: Promise<IDBDatabase | null> | null = null;
const getDb = () => (db ??= open());

function write(run: (store: IDBObjectStore) => void) {
  void getDb().then((d) => {
    if (!d) return;
    try { const tx = d.transaction(STORE, 'readwrite'); run(tx.objectStore(STORE)); } catch { /* storage refused */ }
  });
}

export function loadCardShots(): Promise<void> {
  loading ??= getDb().then((d) => new Promise<void>((resolve) => {
    if (!d) { resolve(); return; }
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => {
        if (!cleared) {
          const now = Date.now();
          const all = (req.result as Entry[]).filter((e) => e && typeof e.key === 'string');
          const read = all.filter((e) => typeof e.data === 'string' && typeof e.at === 'number' && now - e.at < PLACE_MAX_AGE_MS && ![...forgotten].some((u) => e.key.startsWith(`${u}|`)));
          const stale = all.filter((e) => !read.includes(e));
          if (stale.length) write((st) => stale.forEach((e) => st.delete(e.key)));
          entries = [...entries, ...read.filter((e) => !entries.some((f) => f.key === e.key))].sort((a, b) => b.at - a.at);
        }
        resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  })).then(tell);
  return loading;
}

export function peekCardShot(key: string, _hash: string): CardShot | null {
  if (!key) return null;
  const e = entries.find((x) => x.key === key && Date.now() - x.at < PLACE_MAX_AGE_MS);
  return e ? { uri: e.data, kind: 'streets' } : null;
}

/** Any picture kept of this person's card at this place (whatever its theme, size or look then), the theme now first: for MAP_LOADING 'D' (as on the phone). */
export function peekPlaceShot(user: string, lat: number, lng: number, theme: string): string | null {
  const now = Date.now();
  const la = lat.toFixed(4);
  const ln = lng.toFixed(4);
  const here = entries.filter((e) => {
    if (now - e.at >= PLACE_MAX_AGE_MS) return false;
    const part = e.key.split('|');
    return part[0] === user && part[3] === la && part[4] === ln;
  });
  const pick = here.find((e) => e.key.split('|')[1] === theme) ?? here[0];
  return pick ? pick.data : null;
}

export function hasCardShot(key: string, kind: ShotKind): boolean {
  return kind === 'card' || entries.some((e) => e.key === key);
}

export function saveStreetsShot(key: string, dataUrl: string) {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length * 0.75 < MIN_SHOT_BYTES) return;
  const entry: Entry = { key, data: dataUrl, at: Date.now() };
  const next = [entry, ...entries.filter((e) => e.key !== key)];
  const gone = next.slice(KEEP);
  entries = next.slice(0, KEEP);
  write((s) => { s.put(entry); gone.forEach((e) => s.delete(e.key)); });
  tell();
}

/** No pictures with people in a browser. */
export function saveCardShot(_key: string, _hash: string, _base64: string) {}
export const cardCaptureBroken = () => true;
export function dropPeopleShots() {}

export function clearCardShots() {
  cleared = true;
  entries = [];
  write((s) => s.clear());
  try { localStorage.removeItem(HINTS); } catch { /* storage off */ }
  tell();
}

function readHints(): Record<string, CardHint> {
  try { return JSON.parse(localStorage.getItem(HINTS) ?? '{}') as Record<string, CardHint>; } catch { return {}; }
}
export function cardHint(user: string): CardHint | null {
  const h = readHints()[user];
  return h && typeof h.at === 'number' && Date.now() - h.at < PLACE_MAX_AGE_MS ? h : null;
}
/** Only ever a known town's centre (the caller never passes someone's own spot). */
export function setCardHint(user: string, hint: CardHint) {
  try {
    const all = readHints();
    const was = all[user];
    if (was && was.lat === hint.lat && was.lng === hint.lng && was.name === hint.name && typeof was.at === 'number' && Date.now() - was.at < PLACE_MAX_AGE_MS / 7) return;
    all[user] = { lat: hint.lat, lng: hint.lng, name: hint.name, at: Date.now() };
    localStorage.setItem(HINTS, JSON.stringify(all));
  } catch { /* storage off */ }
}
/** Location off, or nobody to see you: where this person's card was, and every picture of their card, gone from this browser. */
export function forgetPlaces(user: string) {
  forgotten.add(user);
  const mine = entries.filter((e) => e.key.startsWith(`${user}|`));
  entries = entries.filter((e) => !e.key.startsWith(`${user}|`));
  // Kept ones not read in yet go too.
  write((st) => {
    const req = st.getAllKeys();
    req.onsuccess = () => (req.result as IDBValidKey[]).forEach((k) => { if (typeof k === 'string' && k.startsWith(`${user}|`)) st.delete(k); });
  });
  try {
    const all = readHints();
    if (all[user]) { delete all[user]; localStorage.setItem(HINTS, JSON.stringify(all)); }
  } catch { /* storage off */ }
  if (mine.length) tell();
}
