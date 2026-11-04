import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image as PhotoImage } from 'expo-image';

import { MapCanvas, type CanvasMarker, type MapCanvasHandle } from '@/components/map/MapCanvas';
import type { Look } from '@/components/map/look';
import type { ClusterTemplates } from '@/components/map/pinEngine';
import { keepMapWarm, triedMapWarm } from '@/features/players/mapWarm';
import type { LatLng } from '@/features/players/positions';
import { simLog } from '@/lib/simDriver';

/** No pins in the picture: the full map's own come in as their wave once its map has taken over. */
const NONE: CanvasMarker[] = [];
/** A copy that has not handed back its picture by now is let go (before any of a map's own retries could add up). */
const GIVE_UP_MS = 7000;

/**
 * The hidden copy of the full map's first view (mapWarm): drawn at the full map's own size, centre, zoom and look, inside
 * the Community card, see-through and untouchable. Once it has drawn, its page hands back a picture of its streets
 * (MapCanvas shoot), kept for the full map's next opening; then `onDone` and the copy is let go by the card.
 */
export function MapWarmCopy({ warmKey, center, zoom, look, tpl, w, h, onDone }: { warmKey: string; center: LatLng; zoom: number; look: Look; tpl: ClusterTemplates; w: number; h: number; onDone: () => void }) {
  const canvas = useRef<MapCanvasHandle | null>(null);
  const doneNow = useRef(onDone);
  doneNow.current = onDone;
  const t0 = useRef(Date.now());
  useEffect(() => {
    triedMapWarm(warmKey);
    simLog('[warm] copy start');
    const t = setTimeout(() => { simLog('[warm] copy gave up'); doneNow.current(); }, GIVE_UP_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
          simLog(`[warm] copy shot ${Date.now() - t0.current}ms ${Math.round(data.length / 1024)}KB`);
          void keepMapWarm(warmKey, data).finally(() => doneNow.current());
        }}
        onStatus={(status) => { if (status === 'failed') doneNow.current(); }}
      />
    </View>
  );
}

/**
 * The full map's picture (mapWarm), over its own map and under its buttons, until `hide()`: its own state, so taking it away
 * redraws nothing else on the page (the hand-over is one frame). Held in a scroll view as the map's own page is, so the phone
 * draws the same soft edge under the status bar over both.
 */
export const MapWarmPicture = forwardRef<{ hide: () => void }, { uri: string; w: number; h: number }>(function MapWarmPicture({ uri, w, h }, ref) {
  const [on, setOn] = useState(true);
  useImperativeHandle(ref, () => ({ hide: () => setOn(false) }), []);
  if (!on) return null;
  return (
    <ScrollView pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" scrollEnabled={false} bounces={false} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false} style={StyleSheet.absoluteFill}>
      <PhotoImage source={{ uri }} contentFit="fill" transition={0} cachePolicy="memory" style={{ width: w, height: h }} />
    </ScrollView>
  );
});

/**
 * The picture, readied on the Community card while it waits (mapWarm): the same image, already handed to the screen, see-through
 * and untouchable inside the card, so the full map's first frame does not have to hand the phone a full-screen picture as it
 * starts its own map (that held the map's start back by about 0.1 s on the simulator).
 */
export function MapWarmPrime({ uri, w, h }: { uri: string; w: number; h: number }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.copy, { width: w, height: h }]}>
      <PhotoImage source={{ uri }} contentFit="fill" transition={0} cachePolicy="memory" style={{ width: w, height: h }} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Never seen: no colour of its own at all, at the card's top left (the card clips it), under everything on the card.
  copy: { position: 'absolute', left: 0, top: 0, opacity: 0 },
});
