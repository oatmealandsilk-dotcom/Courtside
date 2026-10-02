import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { lookFor, thumbLook } from '@/components/map/look';
import { THUMB_ZOOM, ThumbStandIn, keyName, makeQueue, thumbKey } from '@/components/map/thumbShared';
import { themes, useTheme } from '@/theme/ThemeProvider';

/*
 * The browser twin of the phone's court picture. The same map engine the big
 * map uses (MapLibre) draws the spot once in a box off screen, the picture is
 * taken and the engine closed straight away (a browser only allows a handful
 * of live map canvases at a time). The engine itself is only fetched the
 * first time a court card needs a picture. Pictures are kept in the
 * browser's own cache storage (not its small page storage, which the
 * sign-in and the app's quick start need), so a chat opened again shows its
 * maps at once.
 */

const queue = makeQueue();
/** Pictures ready this visit, as addresses of the picture in memory. */
const shots = new Map<string, string>();
const failed = new Set<string>();
/** Each spot is looked for in the browser's cache once per visit, however many cards show it. */
const lookups = new Map<string, Promise<void>>();
const CACHE = 'courtside-court-maps';
/** How many pictures this browser keeps between visits (each is a few dozen KB); the oldest go first. */
const KEEP = 60;

let opened: Promise<Cache | null> | null = null;
/** The browser's cache storage, or null where there is none (an insecure page, some private windows). */
function shelf(): Promise<Cache | null> {
  if (!opened) opened = typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(CACHE).catch(() => null);
  return opened;
}
const addressOf = (key: string) => `${window.location.origin}/court-maps/${keyName(key)}.jpg`;

function lookUp(key: string): Promise<void> {
  let found = lookups.get(key);
  if (!found) {
    found = shelf()
      .then((cache) => cache?.match(addressOf(key)))
      .then((hit) => hit?.blob())
      .then((blob) => { if (blob?.size && !shots.has(key)) shots.set(key, URL.createObjectURL(blob)); })
      .catch(() => {});
    lookups.set(key, found);
  }
  return found;
}

function keep(key: string, picture: Blob) {
  shots.set(key, URL.createObjectURL(picture));
  queue.leave(key);
  void shelf().then(async (cache) => {
    if (!cache) return;
    await cache.put(addressOf(key), new Response(picture, { headers: { 'content-type': 'image/jpeg' } }));
    const all = await cache.keys();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await cache.delete(old);
  }).catch(() => {
    // Storage full or switched off: the picture still shows for this visit.
  });
}

let drawing = false;
/** Draws the first spot in line, if nothing is being drawn already. */
function drawNext(key: string, lat: number, lng: number, width: number, height: number, look: ReturnType<typeof lookFor>) {
  if (drawing) return;
  drawing = true;
  import('@/components/map/snapshotWeb')
    .then((m) => m.snapshotMap({ lat, lng, zoom: THUMB_ZOOM, width, height, look }))
    .then((picture) => keep(key, picture))
    .catch(() => { failed.add(key); queue.leave(key); })
    .finally(() => { drawing = false; queue.emit(); });
}

/** A still map of a spot, `width` × `height`, in the theme's own map colours. Takes no taps: the card it sits in does. */
export function CourtMapThumb({ lat, lng, width, height }: { lat: number; lng: number; width: number; height: number }) {
  const { theme } = useTheme();
  const key = thumbKey(theme, lat, lng, width, height);
  const look = useMemo(() => thumbLook(lookFor(themes[theme])), [theme]);
  const shot = useSyncExternalStore(queue.subscribe, () => shots.get(key) ?? null, () => null);
  const turn = useSyncExternalStore(queue.subscribe, () => queue.first() === key && !drawing, () => false);
  useEffect(() => {
    if (shots.has(key) || failed.has(key)) return undefined;
    let gone = false;
    // Kept from an earlier visit: shown at once. Otherwise it waits its turn to be drawn.
    void lookUp(key).then(() => {
      if (gone) return;
      if (shots.has(key)) queue.emit();
      else queue.join(key);
    });
    return () => { gone = true; if (!shots.has(key)) queue.leave(key); };
  }, [key]);
  useEffect(() => { if (turn && !shot) drawNext(key, lat, lng, width, height, look); }, [turn, shot, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); }, [shot]);
  return (
    <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
      {!shown ? <ThumbStandIn look={look} seed={key} /> : null}
      {shot ? <Image source={{ uri: shot }} onLoad={() => setShown(true)} style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]} resizeMode="cover" /> : null}
    </View>
  );
}

/** The phone draws its court pictures in a hidden web view this mounts; a browser draws them off screen itself, so there is nothing to mount. */
export function CourtMapSnapshots() {
  return null;
}
