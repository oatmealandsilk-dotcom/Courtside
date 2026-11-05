import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { Image as PhotoImage, type ImageRef } from 'expo-image';

import type { User } from '@/data/types';
import type { LatLng } from '@/features/players/positions';
import { simAction, simLog } from '@/lib/simDriver';

/*
 * The full map ready before it opens (Nov 4, owner: "Keep the map ready in background").
 *
 * Tapping the Community map card pushes the full map, whose map is a web view. The phone can only start
 * that web view once the page is on screen, and starting one takes about half a second (simulator, Nov 3:
 * 0.42-0.69 s before its page even begins), so the page slid in with no streets and they came after the
 * slide. A web view cannot be handed from one page to another (the phone makes a new one), and keeping a
 * live map over every page is what broke on Oct 22 (a map left over every page). So, as the Community card
 * already does with its own picture (cardShot): a picture of exactly what the full map will draw first.
 *
 *  - Once the Community card has drawn and been on show a moment, a hidden copy of the full map (inside the
 *    card, see-through, never touched) draws the full map's first view (its centre, zoom, size and look), and
 *    its page hands back a picture of its streets. The copy is then let go: nothing keeps running.
 *  - The full map, opened on exactly that view, shows the picture from its first frame, under
 *    its buttons and over its own map, so its streets slide in with it. Its own map starts underneath as
 *    always; its pins wait while the picture is up, and the moment its map has drawn the same streets the
 *    picture goes (nothing on screen changes) and the pins come in as their usual wave.
 *  - Anything else, the way it was: no picture yet, a different view (a court, a hit, a player, a place, a
 *    new fix), Only me (nothing of where you are is kept), the check-in zoom's swoop. The picture stays until the map's
 *    own streets have drawn: only a finger moving the map, a move asked for (a search, a pin, a new fix), a theme change
 *    or a page that fails takes it away sooner (v3: a slow map never shows streets, then blank, then streets).
 *  - The picture is kept in memory only, held by the app itself (expo-image's loadAsync: a reference to the decoded
 *    picture, not its memory cache, which the phone empties whenever the app goes to the background, v3): its file
 *    (the only way to read it in) goes the moment it has been read, and so does any copy the picture loader put in its
 *    own disk cache, so nothing of where you are stays on the phone's storage (mapModel's rule for an exact centre). It
 *    goes on a memory warning (and none is made for a while after), on sign-out, with Location off or Only me
 *    (forgetPlaces); a new view's picture replaces the old. A file left by a run that stopped half way goes at the next start.
 *  - The copy draws only while the Community card is on show and nothing else is happening there (no Up to hit, no zoom,
 *    no page opening over it, not on Discussions), only after a pause with no finger on the screen, and stops the moment
 *    any of that starts or any finger lands (NearbyMap, MapWarmCopy, fingers).
 *
 * Admins first (MAP_WARM_FOR_EVERYONE), iPhone only: the website and Android are as they were.
 */
export const MAP_WARM_FOR_EVERYONE = false;

/** The simulator's proof only ("mapwarm on=0|1|switch"): today's way and this one in the same session. */
let forced: boolean | null = null;

/** Whether the full map opens on its picture for this person (iPhone only). */
export const mapWarmOn = (me: User | null | undefined): boolean =>
  Platform.OS === 'ios' && (forced ?? (MAP_WARM_FOR_EVERYONE || !!me?.isAdmin));

/** The full map's first view, as the picture's key: who, the map's look, where, how close, and the page's size. */
export function warmKey(o: { user: string; look: string; center: LatLng; zoom: number; w: number; h: number; scale: number }): string {
  return `${o.user}|${o.look}|${o.center.lat.toFixed(6)},${o.center.lng.toFixed(6)}|${o.zoom.toFixed(3)}|${Math.round(o.w)}x${Math.round(o.h)}@${o.scale}`;
}

/** `t0`: when its keep began (a slower, older keep finishing last never replaces a newer picture). */
interface Warm { key: string; picture: ImageRef; at: number; t0: number }
let warm: Warm | null = null;
/** Views whose picture is being read in right now: no second copy is made for one meanwhile (v3: a slow keep let 6 pile up). */
const keeping = new Set<string>();
/** A keep that has not finished by then is given up (its picture, if it ever comes, let go): the card may try again. */
const KEEP_MAX_MS = 10_000;
/** A picture being shown (MapWarmPicture), by picture: one that has gone is let go only once nothing shows it. */
const showing = new Map<ImageRef, number>();
/** Pictures gone from `warm` and waiting to be let go (none showing them). */
const retired = new Set<ImageRef>();
/** Lets a picture go (its memory back) once nothing shows it, a moment later (a page being built with it never gets a released one). */
function retire(picture: ImageRef) {
  retired.add(picture);
  setTimeout(() => {
    if (!retired.has(picture) || (showing.get(picture) ?? 0) > 0) return;
    retired.delete(picture);
    try { picture.release(); } catch { /* let go already */ }
  }, 1500);
}
/** The full map showing a picture: held until it stops (then let go if it has gone meanwhile). */
export function showMapWarm(picture: ImageRef): () => void {
  showing.set(picture, (showing.get(picture) ?? 0) + 1);
  return () => {
    const n = (showing.get(picture) ?? 1) - 1;
    if (n > 0) { showing.set(picture, n); return; }
    showing.delete(picture);
    if (retired.has(picture)) { retired.delete(picture); retire(picture); }
  };
}
/** Counts each letting go: a picture from a copy started before one (signed out meanwhile) is thrown away, never kept. */
let gen = 0;
/** No new picture before this (a memory warning). */
let restUntil = 0;
/** Copies that failed for a view this launch (a copy cut off by a tap, or one whose picture was kept, never counts). */
const fails = new Map<string, number>();
let version = 0;
const listeners = new Set<() => void>();
const tell = () => { version += 1; listeners.forEach((fn) => fn()); };

const FOLDER = 'map-warm';
let swept = false;
/** Every picture file, this run's and any an earlier run left behind (the app stopped half way through keeping one). */
function sweep() {
  swept = true;
  try { const dir = new Directory(Paths.cache, FOLDER); if (dir.exists) dir.delete(); } catch { /* none */ }
}
function remove(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* gone already */ }
}
let sweepArmed = false;
/**
 * A file an earlier run left behind goes soon after the Community card first shows for someone who has this (before any
 * new one, keepMapWarm, whichever comes first). Nobody else's phone looks.
 */
export function mapWarmSweepSoon() {
  if (sweepArmed || Platform.OS !== 'ios') return;
  sweepArmed = true;
  setTimeout(() => { if (!swept) sweep(); }, 8000);
}

/** The picture for exactly this view, if there is one ready (decoded in memory, so it shows from the page's first frame). */
export function takeMapWarm(key: string): ImageRef | null {
  return warm && warm.key === key ? warm.picture : null;
}

/** Whether a picture for this view should be made now: none ready or being read in for it, not resting, not failed too often. */
export function wantMapWarm(key: string): boolean {
  if (Date.now() < restUntil) return false;
  if (warm?.key === key || keeping.has(key)) return false;
  return (fails.get(key) ?? 0) < 3;
}

/** A picture for this view is being read in (the card waits for it, rather than starting another copy). */
export const mapWarmKeeping = (key: string) => keeping.has(key);

/** A copy has started drawing this view: the letting-go count it started under (keepMapWarm throws its picture away after any). */
export function startMapWarm(): number {
  return gen;
}

/** A copy for this view failed (its page failed, or it gave up): three in a launch and none is tried again for it. */
export function failedMapWarm(key: string) {
  fails.set(key, (fails.get(key) ?? 0) + 1);
}

/**
 * The picture loader's own copy on the phone's storage, if it made one (expo-image's loadAsync reads through its disk
 * cache): gone, now and again a moment later, since that cache writes in its own time.
 */
function unstore(cacheKey: string) {
  const once = () => {
    void PhotoImage.getCachePathAsync(cacheKey).then((path) => {
      if (!path) return;
      remove(path.startsWith('file://') ? path : `file://${path}`);
      simLog('[warm] cache copy removed');
    }).catch(() => undefined);
  };
  once();
  setTimeout(once, 600);
  setTimeout(once, 3000);
  setTimeout(once, 10_000);
}

/**
 * The copy's picture (a JPEG data URL from its page), from a copy started under `startGen`: written to a file, read into
 * memory and held there by the app (an ImageRef), then the file goes at once (memory only) and the picture is offered to
 * the full map. While it is being read in, no other copy is made for the view (`keeping`); one that takes longer than
 * KEEP_MAX_MS is given up. False if it could not be kept.
 */
export async function keepMapWarm(key: string, dataUrl: string, startGen: number): Promise<boolean> {
  if (!swept) sweep();
  if (startGen !== gen || keeping.has(key)) return false;
  keeping.add(key);
  const t0 = Date.now();
  let uri: string | null = null;
  const cacheKey = `map-warm-${t0}-${Math.round(Math.random() * 1e6)}`;
  let picture: ImageRef | null = null;
  try {
    const dir = new Directory(Paths.cache, FOLDER);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${t0}-${Math.round(Math.random() * 1e6)}.jpg`);
    file.create();
    file.write(dataUrl.replace(/^data:image\/\w+;base64,/, ''), { encoding: 'base64' });
    uri = file.uri;
    const file0 = uri;
    // (The simulator's proof only, "warmkeepslow ms=8000": reading in as slow as on a busy phone. 0 everywhere else.)
    const read = (keepSlowMs ? new Promise<void>((done) => setTimeout(done, keepSlowMs)) : Promise.resolve()).then(() => PhotoImage.loadAsync({ uri: file0, cacheKey }));
    let late = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    picture = await Promise.race([
      read,
      new Promise<null>((resolve) => { timer = setTimeout(() => { late = true; resolve(null); }, KEEP_MAX_MS); }),
    ]).catch(() => null);
    clearTimeout(timer);
    // One that comes after all, once given up on: let go of it at once, and of the picture loader's copy on storage it made.
    if (late) void read.then((p) => { try { p.release(); } catch { /* gone */ } unstore(cacheKey); }, () => undefined);
    remove(uri);
    unstore(cacheKey);
    if (startGen !== gen || Date.now() < restUntil) { if (picture) retire(picture); return false; }
    if (!picture) { failedMapWarm(key); simLog(`[warm] keep failed ${Date.now() - t0}ms${late ? ' (too slow)' : ''}`); return false; }
  } catch {
    if (uri) remove(uri);
    unstore(cacheKey);
    if (picture) retire(picture);
    failedMapWarm(key);
    return false;
  } finally {
    keeping.delete(key);
  }
  fails.delete(key);
  // A newer picture (a keep that began after this one, for a newer view) is kept already: this older one is let go instead.
  if (warm && warm.t0 > t0) { retire(picture); simLog('[warm] older keep let go'); return false; }
  // No redraw for this (the card's copy says it is over itself; the full map reads the picture as it opens).
  if (warm) retire(warm.picture);
  warm = { key, picture, at: Date.now(), t0 };
  simLog(`[warm] kept ${key.split('|').slice(2).join(' ')} ${Date.now() - t0}ms ${picture.width}x${picture.height}@${picture.scale}`);
  return true;
}

/**
 * Gone: the picture, and the folder its files are made in (sign-out, Location off, Only me, a memory warning, a picture that
 * would not load). Any copy started before this has its picture thrown away.
 */
export function dropMapWarm(why: string) {
  gen += 1;
  sweep();
  if (!warm) return;
  retire(warm.picture);
  warm = null;
  tell();
  simLog(`[warm] dropped ${why}`);
}

/** Copies drawing now (MapWarmCopy): each stops itself when told to (a memory warning), nothing else redrawn. */
const copies = new Set<() => void>();
/** A copy drawing: told to stop on a memory warning (until it has ended). */
export function onMapWarmStop(stop: () => void): () => void {
  copies.add(stop);
  return () => { copies.delete(stop); };
}

/**
 * Short of memory: the picture goes, any copy drawing one stops (the Community card's), and none is made for two minutes.
 * Nothing redraws unless a picture was there to go (dropMapWarm): on a phone without this, it only notes the time.
 */
function memoryWarning() {
  restUntil = Date.now() + 120_000;
  // A picture being read in meanwhile is thrown away (keepMapWarm checks the count).
  if (warm) dropMapWarm('memory'); else gen += 1;
  [...copies].forEach((stop) => stop());
}
if (Platform.OS === 'ios') AppState.addEventListener('memoryWarning', memoryWarning);

/** Whether pictures are resting (a memory warning a moment ago); a screen using it redraws when that changes. */
const resting = () => Date.now() < restUntil;
const noListen = () => () => undefined;
const listen = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** Changes when a picture goes or the pictures rest (never when one is kept): the Community card only (`on`), nothing else redraws. */
export function useMapWarmVersion(on: boolean): number {
  return useSyncExternalStore(on ? listen : noListen, () => version, () => version);
}
export const mapWarmResting = resting;

// The simulator's proof (demo builds only): on/off for the same session, and a memory warning as the phone sends it.
simAction('mapwarm', (q) => {
  forced = q.on === '1' ? true : q.on === '0' ? false : null;
  simLog(`[sim] mapwarm ${q.on ?? 'switch'}`);
  tell();
});
simAction('memwarn', () => memoryWarning());
/** The simulator's proof only ("warmpic on=0"): everything as warm but the picture left off, to time what showing it costs. */
let pictureShown = true;
export const mapWarmPictureShown = () => pictureShown;
simAction('warmpic', (q) => { pictureShown = q.on !== '0'; simLog(`[sim] warmpic ${q.on ?? '1'}`); });
/**
 * The simulator's proof only ("warmhold ms=3000"): the picture kept up that long after the map has drawn, as on a slow phone, so
 * leaving the map while it is up (Back, the swipe back, a drag) can be filmed on a busy Mac. 0 everywhere else.
 */
let holdMs = 0;
export const mapWarmSimHold = () => holdMs;
simAction('warmhold', (q) => { holdMs = Number(q.ms) || 0; simLog(`[sim] warmhold ${holdMs}`); });
/**
 * The simulator's proof only ("mapslow ms=6000"): the full map's own map (today's way and this one alike) starts that much later
 * after the page opens, as on a slow phone or a slow connection, so a slow map can be filmed. 0 everywhere else.
 */
let slowMs = 0;
export const mapWarmSimSlow = () => slowMs;
simAction('mapslow', (q) => { slowMs = Number(q.ms) || 0; simLog(`[sim] mapslow ${slowMs}`); });
/** The simulator's proof only ("warmkeepslow ms=8000"): each picture read in that much later, to show no second copy starts meanwhile. */
let keepSlowMs = 0;
simAction('warmkeepslow', (q) => { keepSlowMs = Number(q.ms) || 0; simLog(`[sim] warmkeepslow ${keepSlowMs}`); });
