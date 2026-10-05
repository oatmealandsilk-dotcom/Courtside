import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { sheetFling } from '@/components/map/sheetFling';
import { layerZ, useStageLayers, type StageKind, type StageLayer } from '@/components/map/stageLayers';

/*
 * The bottom of the full map: the tray of players, or the card for whatever
 * was tapped, with the map's buttons (Back to me, the credits) riding on top
 * of whichever is up. Changing what is up glides rather than cuts, the way
 * Snap Map's friend cards move:
 *
 * - A card rises from the bottom edge on a soft spring (about a third of a
 *   second) while the tray fades down out of the way.
 * - Closing (×, a tap on the map, a swipe down) slides the card down and
 *   fades it, then it is gone; the tray settles back in under it. After a
 *   swipe the card carries on at the finger's speed rather than starting over.
 * - Tapping another pin while a card is up: the old card sinks as the new
 *   one rises over it.
 * - Every exit starts from wherever the layer is at that moment, so closing
 *   a card that is still rising, or tapping a pin just after closing one,
 *   never snaps anything back first.
 * - The map's buttons fade off the layer that is leaving and back on above
 *   the one arriving, once it has landed.
 * - Reduce Motion: fades only.
 *
 * Each layer is its own view with its own position and opacity, on the
 * animation thread. The one that is up sits in the stage's flow; one on its
 * way out is lifted out of the flow and pinned to the bottom edge where it
 * already was, so a new layer of a different height never moves it. The
 * browser's twin (CardStage.web) does the same with the browser's own
 * animations; what is up and what is leaving is decided for both by
 * useStageLayers.
 */

/** A soft spring that comes to rest without overshooting: a sheet flush with the bottom edge must never lift off it. */
const RISE = { damping: 30, stiffness: 300, mass: 1, overshootClamping: true } as const;
/** Leaving: away promptly, so it reads as sliding down rather than dissolving in place; gone in about a quarter of a second. */
const SINK = Easing.bezier(0.4, 0, 0.2, 1);
/** Below the screen: where a card waits for its first measurement before it rises. */
const OFFSTAGE = 4000;

export function CardStage({ cardKey, kind, crown, children }: {
  /** What is up ('tray', 'me', 'p:<id>', 'c:<id>'…); a new key is a new card. */
  cardKey: string;
  /** The tray settles in place; a card rises. */
  kind: StageKind;
  /** Rides on top of whatever is up: the map's buttons. */
  crown?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { layers, remove } = useStageLayers(cardKey, kind, children);
  return (
    <View pointerEvents="box-none">
      {layers.map((layer) => (
        <Layer key={layer.id} layer={layer} out={layer.out} crown={crown} onGone={remove} />
      ))}
    </View>
  );
}

function Layer({ layer, out, crown, onGone }: { layer: StageLayer; out: boolean; crown?: React.ReactNode; onGone: (layer: StageLayer) => void }) {
  const reduce = useReducedMotion();
  const rises = layer.kind === 'card' && !reduce && !layer.first;
  // Down from its resting place; how solid it is; and the buttons riding on it.
  const y = useSharedValue(rises ? OFFSTAGE : layer.first || reduce ? 0 : 10);
  const opacity = useSharedValue(layer.first || rises ? 1 : 0);
  const crownOpacity = useSharedValue(layer.first || layer.kind === 'tray' ? 1 : 0);
  const height = useRef(0);
  const risen = useRef(!rises);
  const inner = useRef<View>(null);

  // A card comes up from just below the edge, its own height plus a little, solid from the first frame.
  const rise = (h: number) => {
    height.current = h;
    if (risen.current || out) return;
    risen.current = true;
    y.value = withSequence(withTiming(h + 16, { duration: 0 }), withSpring(0, RISE));
    crownOpacity.value = withDelay(220, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }));
  };

  // Its height before it is first drawn (the phone's layout is ready by now), so the rise starts at once.
  useLayoutEffect(() => {
    if (!rises) return;
    inner.current?.measure((_x, _y, _w, h) => { if (h > 0) rise(h); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving: the tray (or anything under Reduce Motion) fades in; a card rises once measured, above.
  useEffect(() => {
    if (layer.first || rises) return;
    if (reduce) {
      opacity.value = withTiming(1, { duration: 200 });
      crownOpacity.value = withTiming(1, { duration: 200 });
      return;
    }
    // Under the card that is leaving: there to be uncovered as that slides away.
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
    y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving: from wherever it is right now, never snapped back first; gone once it has finished.
  useEffect(() => {
    if (!out) return;
    const gone = () => onGone(layer);
    crownOpacity.value = withTiming(0, { duration: 120 });
    // Swiped away: it is already moving, so it keeps going rather than easing off from rest.
    const flung = layer.kind === 'card' && sheetFling.value > 0;
    if (layer.kind === 'card') sheetFling.value = 0;
    // A card that never got as far as rising was never seen: nothing to play.
    if (!risen.current) { gone(); return; }
    if (reduce) {
      opacity.value = withTiming(0, { duration: 160 }, (done) => { if (done) runOnJS(gone)(); });
    } else if (layer.kind === 'card') {
      const to = (height.current || 600) + 16;
      y.value = withTiming(to, flung ? { duration: 220, easing: Easing.out(Easing.quad) } : { duration: 260, easing: SINK }, (done) => { if (done) runOnJS(gone)(); });
      // Solid while it slides, so it reads as a card going down, then gone softly over the last stretch.
      opacity.value = withDelay(flung ? 100 : 120, withTiming(0, { duration: flung ? 120 : 140 }));
    } else {
      y.value = withTiming(10, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }, (done) => { if (done) runOnJS(gone)(); });
    }
  }, [out]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  const crownLook = useAnimatedStyle(() => ({ opacity: crownOpacity.value }));

  return (
    <Animated.View
      pointerEvents={out ? 'none' : 'box-none'}
      style={[{ zIndex: layerZ(layer) }, out && { position: 'absolute', left: 0, right: 0, bottom: 0 }, look]}
    >
      <View
        ref={inner}
        pointerEvents="box-none"
        // Kept up to date as the card's content settles, so its exit always clears the edge.
        onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) rise(h); }}
      >
        {crown ? <Animated.View pointerEvents="box-none" style={crownLook}>{crown}</Animated.View> : null}
        {layer.node}
      </View>
    </Animated.View>
  );
}
