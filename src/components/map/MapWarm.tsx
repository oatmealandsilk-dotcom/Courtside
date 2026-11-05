import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image as PhotoImage, type ImageRef } from 'expo-image';
import { useNavigation } from 'expo-router';

import { MapCanvas, type CanvasMarker, type MapCanvasHandle } from '@/components/map/MapCanvas';
import type { Look } from '@/components/map/look';
import type { ClusterTemplates } from '@/components/map/pinEngine';
import { failedMapWarm, keepMapWarm, onMapWarmStop, showMapWarm, startMapWarm } from '@/features/players/mapWarm';
import type { LatLng } from '@/features/players/positions';
import { useIsFocused } from '@/lib/useIsFocused';
import { simLog } from '@/lib/simDriver';
import { fingersQuietMs, onFingerDown } from '@/lib/fingers';

/** No pins in the picture: the full map's own come in as their wave once its map has taken over. */
const NONE: CanvasMarker[] = [];
/** A copy that has not handed back its picture by now is let go (before any of a map's own retries could add up). */
const GIVE_UP_MS = 7000;
/** How often a copy drawing asks whether it may carry on (the card still in view, nothing else started there). */
const ALIVE_MS = 200;
/** A copy starts only after this long with no finger on the screen (as the card asks before picking one: NearbyMap WARM_SETTLE_MS). */
const QUIET_MS = 1500;

/**
 * The hidden copy of the full map's first view (mapWarm): drawn at the full map's own size, centre, zoom and look, inside
 * the Community card, see-through and untouchable. Once it has drawn, its page hands back a picture of its streets
 * (MapCanvas shoot), kept for the full map's next opening; then it lets itself go (`onOver`).
 *
 * It stops at once, itself (nothing else on the card redraws), the moment anything else happens: any finger landing
 * anywhere in the app (fingers: before the tap it starts has even lifted, v3), a page opening over the tabs (a thread, a
 * player, the full map: the tab's own "on show", not the later one the card waits for), another tab, or `alive()` turning
 * false (Discussions on show, Up to hit or its zoom, the app put away), or `stop` from a tap on the card. So its work never
 * lands on a page opening, a zoom or a touch.
 */
export function MapWarmCopy({ warmKey, center, zoom, look, tpl, w, h, alive, stop, onOver }: {
  warmKey: string; center: LatLng; zoom: number; look: Look; tpl: ClusterTemplates; w: number; h: number;
  alive: () => boolean; stop: React.RefObject<(() => void) | null>; onOver: () => void;
}) {
  const canvas = useRef<MapCanvasHandle | null>(null);
  const overNow = useRef(onOver);
  overNow.current = onOver;
  const aliveNow = useRef(alive);
  aliveNow.current = alive;
  const t0 = useRef(Date.now());
  const startGen = useRef(0);
  const shown = useIsFocused();
  // A finger landed between the card picking this copy and its first draw (before it could hear one): it never starts at all.
  const [over, setOver] = useState(() => fingersQuietMs() < QUIET_MS);
  // Covered or another tab: gone in this same draw (and for good: a new copy starts once the card has settled again).
  if (!shown && !over) setOver(true);
  const endedRef = useRef(false);
  // Its clocks and its ear for fingers, stopped the moment it ends (it stays mounted, drawing nothing, until the card moves on):
  // a copy whose picture was shot is never counted as failed later by its give-up clock (v3).
  const stopAll = useRef<() => void>(() => undefined);
  const end = useRef((why: 'shot' | 'failed' | 'cut', by = '') => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopAll.current();
    simLog(`[warm] copy ${why}${by ? ` ${by}` : ''} ${Date.now() - t0.current}ms`);
    setOver(true);
    overNow.current();
  }).current;
  useEffect(() => {
    startGen.current = startMapWarm();
    simLog('[warm] copy start');
    stop.current = () => end('cut', 'tap');
    const giveUp = setTimeout(() => { if (endedRef.current) return; failedMapWarm(warmKey); end('failed'); }, GIVE_UP_MS);
    const check = setInterval(() => { if (!aliveNow.current()) end('cut', 'busy'); }, ALIVE_MS);
    const offFinger = onFingerDown(() => end('cut', 'finger'));
    const offStop = onMapWarmStop(() => end('cut', 'memory'));
    stopAll.current = () => { clearTimeout(giveUp); clearInterval(check); offFinger(); offStop(); };
    return () => { stopAll.current(); if (stop.current) stop.current = null; end('cut'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (over) end('cut'); }, [over]); // eslint-disable-line react-hooks/exhaustive-deps
  if (over) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.copy, { width: w, height: h }]}>
      <MapCanvas
        ref={canvas}
        center={center}
        zoom={zoom}
        look={look}
        interactive={false}
        markers={NONE}
        tpl={tpl}
        onPainted={() => { simLog(`[warm] copy drawn ${Date.now() - t0.current}ms`); canvas.current?.shoot(); }}
        onShot={(data) => {
          if (endedRef.current) return;
          simLog(`[warm] copy shot ${Date.now() - t0.current}ms ${Math.round(data.length / 1024)}KB`);
          const g = startGen.current;
          // Its page has done its part: let go of it now, while the picture is read in.
          end('shot');
          void keepMapWarm(warmKey, data, g);
        }}
        onStatus={(status) => { if (status === 'failed' && !endedRef.current) { failedMapWarm(warmKey); end('failed'); } }}
      />
    </View>
  );
}

/**
 * The full map opened on its picture (mapWarm): whether its page has started to leave (`leaving`: the system's swipe back or
 * Back), so a late move of the map under a swipe back the system took (the Simulator hands the page a swipe's touches all at
 * once, sometimes just as the page goes) leaves the picture to slide out with the page (NearbyMap warmUserMove). A page pushed
 * over it counts as leaving until it is on show again; a swipe back let go part way, not leaving. Nothing is drawn.
 */
export function MapWarmLeaving({ leaving }: { leaving: MutableRefObject<boolean> }) {
  const navigation = useNavigation();
  useEffect(() => {
    const events = navigation as unknown as { addListener?: (name: string, fn: (e?: { data?: { closing?: boolean } }) => void) => () => void };
    const offStart = events.addListener?.('transitionStart', (e) => { leaving.current = !!e?.data?.closing; simLog(`[warm] page ${leaving.current ? 'leaving' : 'on show'}`); });
    const offCancel = events.addListener?.('gestureCancel', () => { leaving.current = false; simLog('[warm] page stays'); });
    return () => { offStart?.(); offCancel?.(); };
  }, [navigation, leaving]);
  return null;
}

/**
 * The full map's picture (mapWarm), over its own map and under its buttons, until `hide()`: its own state, so taking it away
 * redraws nothing else on the page (the hand-over is one frame). Held in a scroll view as the map's own page is, so the phone
 * draws the same soft edge under the status bar over both. In the page's first draw: brought in a frame later instead (Nov 4
 * review), it came 0.12-0.47 s after the slide began (the app's own thread is busy building the page then), against
 * 0.04-0.12 s, and the slide did not start any sooner (32 opens taking turns). The picture is the app's own (an ImageRef,
 * held in mapWarm, v3), drawn as soon as the view is: nothing to load, so it is there after the app has been away too. It is
 * held while shown (showMapWarm), so a picture replaced or dropped meanwhile is let go only once this has gone. One that
 * will not show anyway goes at once, `onGone`, and the map opens as it always did.
 */
export const MapWarmPicture = forwardRef<{ hide: () => void }, { picture: ImageRef; w: number; h: number; onGone: () => void }>(function MapWarmPicture({ picture, w, h, onGone }, ref) {
  const [on, setOn] = useState(true);
  useImperativeHandle(ref, () => ({ hide: () => setOn(false) }), []);
  useLayoutEffect(() => showMapWarm(picture), [picture]);
  if (!on) return null;
  return (
    <ScrollView pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" scrollEnabled={false} bounces={false} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false} style={StyleSheet.absoluteFill}>
      <PhotoImage source={picture} contentFit="fill" transition={0} onError={() => { setOn(false); onGone(); }} style={{ width: w, height: h }} />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  // Never seen: no colour of its own at all, at the card's top left (the card clips it), under everything on the card.
  copy: { position: 'absolute', left: 0, top: 0, opacity: 0 },
});
