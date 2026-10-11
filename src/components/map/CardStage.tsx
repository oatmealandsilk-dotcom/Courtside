import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type WithTimingConfig } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { sheetFling } from '@/components/map/sheetFling';
import { GlassRenew, useGlassRenewal, useOnPageArrival } from '@/components/ui/Glass';
import { CrownFade, CrownLead, layerZ, takesOver, useStageLayers, type Crown, type StageKind, type StageLayer } from '@/components/map/stageLayers';

/*
 * The bottom of the full map: the card for whatever was tapped (or the list
 * of players), or nothing but the map itself, with the map's buttons (Back to
 * me, the players pill, the credits) riding on top of whichever is up.
 * Changing what is up glides rather than cuts, the way Snap Map's friend
 * cards move:
 *
 * - A card rises from the bottom edge on a soft spring (about a third of a
 *   second) while the bare map's buttons fade down out of the way.
 * - Closing (×, a tap on the map, a swipe down) slides the card down and
 *   fades it, then it is gone. After a swipe the card carries on at the
 *   finger's speed rather than starting over.
 * - Closing back to the bare map, the map's buttons ride down with the card,
 *   from where they sat on it to their own spot, on the card's own curve:
 *   one motion (Oct 10, owner: "the drop down is good but there's like
 *   another weird thing"; they faded off the card mid-air while a second set
 *   faded in at the bottom). The bare map's layer takes them over (takesOver):
 *   its own buttons start in exactly their place, the card's are put away
 *   that moment, and only what the bare map adds (the players pill) fades in,
 *   done before they land. Never from a set that was not fully there: still
 *   fading in, or part faded on a players list pulled up (CrownFade); the
 *   bare map's then fade in at the bottom as usual.
 * - Tapping another pin while a card is up: the old card sinks as the new
 *   one rises over it.
 * - Every exit starts from wherever the layer is at that moment, so closing
 *   a card that is still rising, or tapping a pin just after closing one,
 *   never snaps anything back first.
 * - Opening a card, or swapping one for another, the map's buttons fade off
 *   the layer that is leaving and back on above the one arriving, once it
 *   has landed.
 * - Reduce Motion: fades only.
 * - The buttons' glass (Back to me, the players pill) is put up again once
 *   they have fully arrived (riding down, once the pill has finished fading
 *   in too), and each time the page itself has finished coming in (opened,
 *   or come back to from a page over it), whichever layer is up: an iPhone
 *   draws glass that first appears while something round it is fading in as
 *   a flat white plate, and leaves it so (GlassRenew, Oct 10). Never while a
 *   finger is on them: a pressed pill is dimmed, and glass put up dimmed is
 *   the same white plate (Oct 11, owner: "The island in the bottom sometimes
 *   it's clear sometimes it's not").
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

/** A leaving layer's buttons, for the bare map's to take over from (takesOver): where their foot is, and the slide to ride. */
interface Handoff {
  /** How far above the stage's bottom edge the foot of its buttons was as it started to leave. */
  foot: number;
  /** The card's own slide down, which the buttons taking over ride on. */
  slide: WithTimingConfig;
  /** Its buttons, put away at once: the ones taking over are in their place. */
  hide: () => void;
}
type Handoffs = Map<string, () => Handoff | null>;

export function CardStage({ cardKey, kind, crown, children }: {
  /** What is up ('bare', 'list', 'me', 'p:<id>', 'c:<id>'…); a new key is a new card. */
  cardKey: string;
  /** 'tray' settles in place (the bare map, or the card asking where you are); a card rises. */
  kind: StageKind;
  /** Rides on top of whatever is up: the map's buttons. Given as a function, it is told which card it rides on (its key). */
  crown?: Crown;
  children: React.ReactNode;
}) {
  const { layers, remove } = useStageLayers(cardKey, kind, children);
  // Each layer's buttons as it leaves, found by the layer taking its place (takesOver).
  const handoffs = useRef<Handoffs>(new Map()).current;
  // Each time the page has finished coming in (opened, or come back to from a page over it): every layer's
  // buttons' glass is put up again then, not only the first layer's (Oct 11: a bare map that came after the
  // card asking where you are, or after a card closed, kept whatever glass it had when you came back).
  const [pageIn, setPageIn] = useState(0);
  useOnPageArrival(useCallback(() => setPageIn((n) => n + 1), []));
  return (
    // A view of its own that keeps its layers' stacking to itself. Without it the phone drops this
    // wrapper as layout-only and each card's zIndex reaches out to the map's other controls (Oct 7:
    // a card's shadow then fell on the strip under the tab bar, which each card now carries itself).
    <View pointerEvents="box-none" collapsable={false} style={{ zIndex: 0 }}>
      {layers.map((layer) => (
        <Layer key={layer.id} layer={layer} out={layer.out} crown={crown} onGone={remove} handoffs={handoffs} pageIn={pageIn} />
      ))}
    </View>
  );
}

function Layer({ layer, out, crown: crownFor, onGone, handoffs, pageIn }: { layer: StageLayer; out: boolean; crown?: Crown; onGone: (layer: StageLayer) => void; handoffs: Handoffs; pageIn: number }) {
  // Its own buttons: one on its way out keeps the ones it had (the players list's, faded while it was tall).
  const crown = typeof crownFor === 'function' ? crownFor(layer.key) : crownFor;
  const reduce = useReducedMotion();
  const rises = layer.kind === 'card' && !reduce && !layer.first;
  // Down from its resting place; how solid it is; and the buttons riding on it.
  const y = useSharedValue(rises ? OFFSTAGE : layer.first || reduce ? 0 : 10);
  const opacity = useSharedValue(layer.first || rises ? 1 : 0);
  const crownOpacity = useSharedValue(layer.first || layer.kind === 'tray' ? 1 : 0);
  const height = useRef(0);
  const risen = useRef(!rises);
  const inner = useRef<View>(null);
  // Its buttons' height (none on a players list pulled up out of their room), and how it left: for the bare map's buttons to take over.
  const crownBox = useRef<View>(null);
  const crownH = useRef(0);
  const exit = useRef<{ y0: number; shown: boolean; slide: WithTimingConfig } | null>(null);
  const takeover = takesOver(layer);
  // How solid the buttons are by their own doing (the players list's: ListCrown tells it), which this cannot see.
  const crownFade = useRef<(() => number) | null>(null);
  // What only the bare map's buttons have (the pill, the credits over it): unseen, on one that may take over a
  // closing card's, until it is known whether it does (CrownLead).
  const lead = useSharedValue(takeover ? 0 : 1);
  // Its buttons' glass, put up afresh (GlassRenew) a moment after they have fully arrived, never under a finger.
  const glass = useGlassRenewal();
  const arrived = glass.settle;

  // A card comes up from just below the edge, its own height plus a little, solid from the first frame.
  const rise = (h: number) => {
    height.current = h;
    if (risen.current || out) return;
    risen.current = true;
    y.value = withSequence(withTiming(h + 16, { duration: 0 }), withSpring(0, RISE));
    crownOpacity.value = withDelay(220, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }, (done) => { if (done) runOnJS(arrived)(); }));
  };

  // Its height before it is first drawn (the phone's layout is ready by now), so the rise starts at once.
  useLayoutEffect(() => {
    if (!rises) return;
    inner.current?.measure((_x, _y, _w, h) => { if (h > 0) rise(h); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving: a 'tray' layer (or anything under Reduce Motion) fades in; a card rises once measured, above.
  useEffect(() => {
    if (layer.first || rises) return;
    if (reduce) {
      lead.value = 1;
      opacity.value = withTiming(1, { duration: 200 });
      crownOpacity.value = withTiming(1, { duration: 200 }, (done) => { if (done) runOnJS(arrived)(); });
      return;
    }
    // The bare map after a card closed: its buttons start where the card's were and ride down with it, solid (takesOver).
    // (After the card's own leaving, below: an earlier sibling's effects run first.)
    const from = takeover && layer.replaces ? handoffs.get(layer.replaces.id)?.() : null;
    if (from) {
      let ownH = 0;
      let ownCrown = 0;
      inner.current?.measure((_x, _y, _w, h) => { ownH = h; });
      crownBox.current?.measure((_x, _y, _w, h) => { ownCrown = h; });
      // How far above their own spot they were: only ever down (a card is taller than the bare map's strip).
      const lift = from.foot - (ownH - ownCrown);
      if (ownH > 0 && ownCrown > 0 && lift > 0) {
        from.hide();
        opacity.value = 1;
        // Their glass is put up again once both have finished, the ride down and the pill fading in: glass put up
        // while the pill is still fading is a flat white plate (Oct 11; a swipe's slide, 220, was done before a 240 fade).
        let waiting = 2;
        const landed = () => { waiting -= 1; if (waiting === 0) arrived(); };
        lead.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }, (done) => { if (done) runOnJS(landed)(); });
        y.value = withSequence(withTiming(-lift, { duration: 0 }), withTiming(0, from.slide, (done) => { if (done) runOnJS(landed)(); }));
        return;
      }
    }
    // Nothing taken over: the pill comes with the rest of them, the whole layer unseen until it fades in below.
    lead.value = 1;
    // Under the card that is leaving: there to be uncovered as that slides away.
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }, (done) => { if (done) runOnJS(arrived)(); });
    y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving, its buttons can be taken over by the bare map's (takesOver): only when fully there, never faded (by the stage,
  // or by the players list as it was pulled up: crownFade) or tucked away.
  useEffect(() => {
    handoffs.set(layer.id, () => {
      const left = exit.current;
      if (!left?.shown || crownH.current < 8 || height.current <= 0) return null;
      return {
        foot: height.current - crownH.current - left.y0,
        slide: left.slide,
        hide: () => { cancelAnimation(crownOpacity); crownOpacity.value = 0; },
      };
    });
    return () => { handoffs.delete(layer.id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The page has finished coming in since this layer came (CardStage): the glass put up again, on the layer there
  // when the map opened (nothing of its own fades in, but it came with the page) and on any other still up. Not
  // on one leaving, nor on one only now arriving: its own arrival, above, puts its glass up again.
  const pageSeen = useRef(pageIn);
  useEffect(() => {
    if (pageIn === pageSeen.current) return;
    pageSeen.current = pageIn;
    if (!out) arrived();
  }, [pageIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving: from wherever it is right now, never snapped back first; gone once it has finished.
  useEffect(() => {
    if (!out) return;
    // Its glass is never put up again on the way out: it is fading.
    glass.cancel();
    const gone = () => onGone(layer);
    // Swiped away: it is already moving, so it keeps going rather than easing off from rest.
    const flung = layer.kind === 'card' && sheetFling.value > 0;
    if (layer.kind === 'card') sheetFling.value = 0;
    const slide: WithTimingConfig = flung ? { duration: 220, easing: Easing.out(Easing.quad) } : { duration: 260, easing: SINK };
    // Where it was and how it goes, before anything moves, for the bare map's buttons to take over from (above).
    exit.current = { y0: y.value, shown: risen.current && crownOpacity.value * (crownFade.current?.() ?? 1) > 0.99, slide };
    crownOpacity.value = withTiming(0, { duration: 120 });
    // A card that never got as far as rising was never seen: nothing to play.
    if (!risen.current) { gone(); return; }
    if (reduce) {
      opacity.value = withTiming(0, { duration: 160 }, (done) => { if (done) runOnJS(gone)(); });
    } else if (layer.kind === 'card') {
      const to = (height.current || 600) + 16;
      y.value = withTiming(to, slide, (done) => { if (done) runOnJS(gone)(); });
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
        {crown ? (
          <Animated.View ref={crownBox} pointerEvents="box-none" style={crownLook} onLayout={(e) => { crownH.current = e.nativeEvent.layout.height; }} {...glass.hold}>
            <CrownLead.Provider value={lead}>
              <CrownFade.Provider value={crownFade}><GlassRenew.Provider value={glass.renew}>{crown}</GlassRenew.Provider></CrownFade.Provider>
            </CrownLead.Provider>
          </Animated.View>
        ) : null}
        {layer.node}
      </View>
    </Animated.View>
  );
}
