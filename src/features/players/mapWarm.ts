import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { Image as PhotoImage } from 'expo-image';

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
 *    new fix), Only me (nothing of where you are is kept), the check-in zoom's swoop. A finger moving the map, a
 *    page that fails, or 4 s without drawing, and the picture goes at once.
 *  - The picture goes on a memory warning (and none is made for a while after), on sign-out, with Location
 *    off or Only me (forgetPlaces); a new view's picture replaces the old. One at a time, in the app's cache folder.
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

interface Warm { key: string; uri: string; at: number }
let warm: Warm | null = null;
/** Counts each letting go: a picture still being kept from before one (signed out meanwhile) is thrown away, never kept. */
let gen = 0;
/** No new picture before this (a memory warning). */
let restUntil = 0;
/** Pictures being made for a key (one at a time) and how many tries each has had this launch. */
const tries = new Map<string, number>();
let version = 0;
const listeners = new Set<() => void>();
const tell = () => { version += 1; listeners.forEach((fn) => fn()); };

const FOLDER = 'map-warm';
let swept = false;
/** Pictures from an earlier run (the app stopped before letting go of them): gone before the first new one. */
function sweep() {
  if (swept) return;
  swept = true;
  try { const dir = new Directory(Paths.cache, FOLDER); if (dir.exists) dir.delete(); } catch { /* none */ }
}
function remove(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* gone already */ }
}

/** The picture for exactly this view, if there is one ready (decoded in memory, so it shows from the page's first frame). */
export function takeMapWarm(key: string): string | null {
  return warm && warm.key === key ? warm.uri : null;
}

/** Whether a picture for this view should be made now: none ready for it, not resting, not tried too often. */
export function wantMapWarm(key: string): boolean {
  if (Date.now() < restUntil) return false;
  if (warm?.key === key) return false;
  return (tries.get(key) ?? 0) < 3;
}

/** A try at a picture for this view has begun (the copy is drawing it). */
export function triedMapWarm(key: string) {
  tries.set(key, (tries.get(key) ?? 0) + 1);
}

/** The copy's picture (a JPEG data URL from its page): kept as a file, read into memory, then offered to the full map. */
export async function keepMapWarm(key: string, dataUrl: string): Promise<boolean> {
  sweep();
  const g = gen;
  let uri: string | null = null;
  try {
    const dir = new Directory(Paths.cache, FOLDER);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`);
    file.create();
    file.write(dataUrl.replace(/^data:image\/\w+;base64,/, ''), { encoding: 'base64' });
    uri = file.uri;
    const ok = await PhotoImage.prefetch(uri, 'memory').catch(() => false);
    if (!ok || g !== gen || Date.now() < restUntil) { remove(uri); return false; }
  } catch {
    if (uri) remove(uri);
    return false;
  }
  const old = warm;
  warm = { key, uri, at: Date.now() };
  if (old && old.uri !== uri) remove(old.uri);
  tell();
  simLog(`[warm] kept ${key.split('|').slice(2).join(' ')}`);
  return true;
}

/** Gone: the picture and its file (sign-out, Location off, Only me, a memory warning, a view that is no longer the full map's). */
export function dropMapWarm(why: string) {
  gen += 1;
  if (!warm) return;
  const old = warm;
  warm = null;
  remove(old.uri);
  tell();
  simLog(`[warm] dropped ${why}`);
}

/** Short of memory: the picture goes, any copy drawing one stops (useMapWarmRest), and none is made for two minutes. */
function memoryWarning() {
  restUntil = Date.now() + 120_000;
  dropMapWarm('memory');
  tell();
}
if (Platform.OS === 'ios') AppState.addEventListener('memoryWarning', memoryWarning);

/** Whether pictures are resting (a memory warning a moment ago); a screen using it redraws when that changes. */
const resting = () => Date.now() < restUntil;
export function useMapWarmVersion(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version, () => version);
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
