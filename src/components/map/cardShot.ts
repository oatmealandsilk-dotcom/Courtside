import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Image as ExpoImage } from 'expo-image';

/*
 * A picture of the still map card as it last drew (Oct 22, owner: "The map
 * blips in 50% of the time … can we just pre load the map?"). A web view
 * cannot be built before its page exists, but a picture of what it will draw
 * can be: the card shows this picture from its first frame, and the live map
 * takes its place underneath when it has drawn the same thing, so nothing on
 * screen changes. Kept on this phone only, never uploaded.
 *
 * Two kinds, each for one exact look (keyed by shotKey: who, theme, the map's
 * look itself, centre, zoom, size, scale, what the card's lock says, Reduce
 * Motion). Only ever for a card centred on a town the app knows (never on
 * someone's own spot), and gone when Location goes off (forgetPlaces):
 * - 'streets': the map alone, no people, from the page's own canvas.
 * - 'card': the map with its pins, a photograph of the card's map. It is used
 *   only while the pins are exactly those the card is about to draw (the
 *   marker list's hash) and for no more than CARD_MAX_AGE_MS, and every one is
 *   thrown away whenever who may be seen changes (dropPeopleShots: a block,
 *   who sees you, Location off, the teen rule) and on sign-out (clearCardShots).
 */

export type ShotKind = 'streets' | 'card';
export interface CardShot { uri: string; kind: ShotKind }
/** Where the card was last centred, and the name it gave the place: shown first next time, until a fresh fix says otherwise. */
export interface CardHint { lat: number; lng: number; name: string; at?: number }

interface Entry { key: string; kind: ShotKind; hash?: string; name: string; at: number }
interface Index { v: 1; entries: Entry[]; hints: Record<string, CardHint>; broken?: boolean; last?: string }

const STORE = 'courtside-mapcard-v1';
const FOLDER = 'mapcard';
/** As long as Find Players' own copy of its pins is used (MapCopy): past that, the people in a picture may be out of date. */
const CARD_MAX_AGE_MS = 4 * 60 * 60_000;
/** A picture of the streets alone, and where the card was: a week, so map data and look changes never linger. */
export const PLACE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** A few looks of each kind: the Community card and the feed's, in the last theme or two. */
const KEEP = { streets: 4, card: 3 } as const;
/** Smaller than this, a capture is taken to be blank (the map's drawing did not come out). */
export const MIN_SHOT_BYTES = 15_000;

let index: Index = { v: 1, entries: [], hints: {} };
let version = 0;
let loading: Promise<void> | null = null;
let loaded = false;
/** Dropped before the kept index had been read: done again to what it reads. */
let dropBeforeLoad: 'people' | 'all' | null = null;
/** People whose places were forgotten before the kept index had been read. */
const forgetBeforeLoad = new Set<string>();
const listeners = new Set<() => void>();
const tell = () => { version += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Re-renders when a picture is added or dropped, or the index has loaded. */
export function useCardShots(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** The key for one exact look of a card. */
export function shotKey(k: { user: string; theme: string; look: string; lat: number; lng: number; zoom: number; w: number; h: number; scale: number; lock: string; still: boolean }): string {
  return [k.user, k.theme, k.look, k.lat.toFixed(4), k.lng.toFixed(4), k.zoom, Math.round(k.w), Math.round(k.h), k.scale, k.lock, k.still ? 1 : 0].join('|');
}

/** A short fingerprint of some text (FNV-1a): the card's marker list, so a picture is used only for the same pins. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const fileName = (key: string, kind: ShotKind, hash?: string) => `${kind}-${hashText(key)}${hash ? `-${hash}` : ''}.jpg`;
const fileFor = (name: string) => new File(Paths.cache, FOLDER, name);
function folder(): Directory {
  const dir = new Directory(Paths.cache, FOLDER);
  if (!dir.exists) dir.create();
  return dir;
}
function remove(name: string) {
  try { const f = fileFor(name); if (f.exists) f.delete(); } catch { /* already gone */ }
}
/** Any file in the folder the index does not know (a write the app was closed in the middle of), gone. */
function sweep() {
  try {
    const dir = new Directory(Paths.cache, FOLDER);
    if (!dir.exists) return;
    const known = new Set(index.entries.map((e) => e.name));
    dir.list().forEach((item) => { if (item instanceof File && !known.has(item.name)) { try { item.delete(); } catch { /* in use */ } } });
  } catch { /* unreadable */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void AsyncStorage.setItem(STORE, JSON.stringify(index)).catch(() => undefined);
  }, 300);
}

/**
 * Reads which pictures are kept (during the splash: preloadNearbyMap), drops any
 * whose file has gone, and has the phone decode them ahead, so the card's first
 * frame can already be its picture.
 */
export function loadCardShots(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORE).then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Index>;
    if (parsed.v !== 1 || !Array.isArray(parsed.entries)) return;
    const now = Date.now();
    const entries = parsed.entries.filter((e) => {
      const keep = e && typeof e.key === 'string' && typeof e.name === 'string' && ((e.kind === 'streets' && now - e.at < PLACE_MAX_AGE_MS) || (e.kind === 'card' && now - e.at < CARD_MAX_AGE_MS));
      if (!keep) { if (e?.name) remove(e.name); return false; }
      try { return fileFor(e.name).exists; } catch { return false; }
    });
    // Pictures kept this session already (saved before the read finished) come first.
    const fresh = index.entries;
    const hints: Record<string, CardHint> = {};
    Object.entries(parsed.hints ?? {}).forEach(([who, h]) => { if (h && typeof h.at === 'number' && now - h.at < PLACE_MAX_AGE_MS) hints[who] = h; });
    index = { v: 1, entries: [...fresh, ...entries.filter((e) => !fresh.some((f) => f.name === e.name))], hints: { ...hints, ...index.hints }, broken: !!parsed.broken || index.broken, last: index.last ?? parsed.last };
    if (entries.length !== parsed.entries.length || Object.keys(hints).length !== Object.keys(parsed.hints ?? {}).length) persist();
  }).catch(() => undefined).then(() => {
    loaded = true;
    if (dropBeforeLoad === 'all') clearCardShots();
    else if (dropBeforeLoad === 'people') dropPeopleShots();
    if (dropBeforeLoad !== 'all') forgetBeforeLoad.forEach((who) => forgetPlaces(who));
    forgetBeforeLoad.clear();
    dropBeforeLoad = null;
    sweep();
    tell();
    // Decoded ahead: only the look the card showed last (its picture with pins, and its streets), not every one kept.
    const uris = index.entries.filter((e) => e.key === index.last).map((e) => fileFor(e.name).uri);
    if (uris.length) void ExpoImage.prefetch(uris, 'memory').catch(() => false);
  });
  return loading;
}

/**
 * The picture to cover the card with for this look: one with its pins when
 * they are exactly `hash`'s and recent, else the streets alone, else none.
 */
export function peekCardShot(key: string, hash: string): CardShot | null {
  if (!key) return null;
  const now = Date.now();
  const card = index.entries.find((e) => e.key === key && e.kind === 'card' && e.hash === hash && now - e.at < CARD_MAX_AGE_MS);
  if (card) return { uri: fileFor(card.name).uri, kind: 'card' };
  const streets = index.entries.find((e) => e.key === key && e.kind === 'streets' && now - e.at < PLACE_MAX_AGE_MS);
  return streets ? { uri: fileFor(streets.name).uri, kind: 'streets' } : null;
}

/** Whether this look is kept already (a 'card' picture: with exactly these pins, recently). */
export function hasCardShot(key: string, kind: ShotKind, hash?: string): boolean {
  const now = Date.now();
  return index.entries.some((e) => e.key === key && e.kind === kind && (kind === 'streets' || (e.hash === hash && now - e.at < CARD_MAX_AGE_MS / 2)));
}

function keep(key: string, kind: ShotKind, base64: string, hash?: string) {
  const name = fileName(key, kind, hash);
  try {
    const file = new File(folder(), name);
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: 'base64' });
  } catch {
    return;
  }
  // One picture per look and kind: an older one of the same look goes.
  const old = index.entries.filter((e) => e.key === key && e.kind === kind);
  old.forEach((e) => { if (e.name !== name) remove(e.name); });
  const rest = index.entries.filter((e) => !(e.key === key && e.kind === kind));
  const entry: Entry = { key, kind, hash, name, at: Date.now() };
  const same = [entry, ...rest.filter((e) => e.kind === kind)];
  same.slice(KEEP[kind]).forEach((e) => remove(e.name));
  index = { ...index, entries: [...same.slice(0, KEEP[kind]), ...rest.filter((e) => e.kind !== kind)], last: key };
  persist();
  tell();
}

/** The map alone, as the page drew it (a JPEG data URL from its canvas). */
export function saveStreetsShot(key: string, dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  if (base64.length * 0.75 < MIN_SHOT_BYTES) return;
  keep(key, 'streets', base64);
}

/**
 * The map with its pins, photographed (base64 JPEG). Kept only when it is not
 * blank: a photograph much smaller than the streets alone means the phone did
 * not capture the map's drawing, and from then on only streets are kept here.
 */
export function saveCardShot(key: string, hash: string, base64: string) {
  const bytes = base64.length * 0.75;
  const streets = index.entries.find((e) => e.key === key && e.kind === 'streets');
  let streetBytes = 0;
  try { streetBytes = streets ? fileFor(streets.name).size ?? 0 : 0; } catch { streetBytes = 0; }
  if (bytes < MIN_SHOT_BYTES || (streetBytes && bytes < streetBytes * 0.5)) {
    index = { ...index, broken: true };
    persist();
    return;
  }
  keep(key, 'card', base64, hash);
}

/** Whether photographing the card has come out blank on this phone before (then only the streets are kept). */
export const cardCaptureBroken = () => !!index.broken;

/** Every picture with people on it, gone (who may be seen has changed). The streets alone stay. */
export function dropPeopleShots() {
  if (!loaded && dropBeforeLoad !== 'all') dropBeforeLoad = 'people';
  const people = index.entries.filter((e) => e.kind === 'card');
  if (!people.length) return;
  people.forEach((e) => remove(e.name));
  index = { ...index, entries: index.entries.filter((e) => e.kind !== 'card') };
  persist();
  tell();
}

/** Signing out: every picture and every remembered centre, gone (the whole folder, files the index never knew of too). */
export function clearCardShots() {
  if (!loaded) dropBeforeLoad = 'all';
  index.entries.forEach((e) => remove(e.name));
  try { const dir = new Directory(Paths.cache, FOLDER); if (dir.exists) dir.delete(); } catch { /* already gone */ }
  index = { v: 1, entries: [], hints: {}, broken: index.broken };
  persist();
  tell();
}

/**
 * Location off, or nobody to see you: where this person's card was (its remembered centre) and every
 * picture of their card, gone from this phone at once.
 */
export function forgetPlaces(user: string) {
  if (!loaded) forgetBeforeLoad.add(user);
  const mine = index.entries.filter((e) => e.key.startsWith(`${user}|`));
  if (!mine.length && !index.hints[user]) return;
  mine.forEach((e) => remove(e.name));
  const hints = { ...index.hints };
  delete hints[user];
  index = { ...index, entries: index.entries.filter((e) => !e.key.startsWith(`${user}|`)), hints, last: index.last?.startsWith(`${user}|`) ? undefined : index.last };
  persist();
  tell();
}

export function cardHint(user: string): CardHint | null {
  const h = index.hints[user];
  return h && typeof h.at === 'number' && Date.now() - h.at < PLACE_MAX_AGE_MS ? h : null;
}
/** Only ever a known town's centre (the caller never passes someone's own spot). */
export function setCardHint(user: string, hint: CardHint) {
  const was = index.hints[user];
  if (was && was.lat === hint.lat && was.lng === hint.lng && was.name === hint.name && typeof was.at === 'number' && Date.now() - was.at < PLACE_MAX_AGE_MS / 7) return;
  index = { ...index, hints: { ...index.hints, [user]: { lat: hint.lat, lng: hint.lng, name: hint.name, at: Date.now() } } };
  persist();
}
