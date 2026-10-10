import React, { useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { sheetFling } from '@/components/map/sheetFling';
import { layerZ, useStageLayers, type Crown, type StageKind, type StageLayer } from '@/components/map/stageLayers';

/*
 * The browser's twin of CardStage (see there for the choreography): the
 * same rise, sink and swap, done with the browser's own animations
 * (element.animate), which run off the page's main thread, so they stay
 * smooth while the map flies to what was tapped. What is up and what is
 * leaving is decided for both by useStageLayers.
 *
 * The card that is up sits in the page's flow and sets the stage's height;
 * one on its way out is lifted out of the flow, pinned to the bottom edge
 * where it already was, and removed once its animation ends.
 *
 * The phone's stage also puts its buttons' glass up again once they have
 * arrived (GlassRenew), for an iPhone that draws it white otherwise. Not
 * here: the browser's frosted glass is a live style that is right on any
 * frame (checked Oct 10, the players pill from its first frame on /map).
 */

/** Apple's own sheet curve: a quick start that glides to rest, the browser's stand-in for the phone's spring. */
const RISE = 'cubic-bezier(.32,.72,0,1)';
const RISE_MS = 380;
/** Leaving: away promptly, so it reads as sliding down rather than dissolving in place. */
const SINK = 'cubic-bezier(.4,0,.2,1)';
const SINK_MS = 260;

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where an element is right now, mid-animation or not, so a new animation starts from there rather than jumping. */
function current(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return { transform: cs.transform && cs.transform !== 'none' ? cs.transform : 'translateY(0px)', opacity: Number(cs.opacity || 1) };
}

function enter(el: HTMLElement, crown: HTMLElement | null, kind: StageKind) {
  if (still()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); return; }
  if (kind === 'card') {
    const h = el.offsetHeight;
    // Solid from the first frame: it comes up from below the edge, over whatever was there.
    el.animate([{ transform: `translateY(${h + 16}px)` }, { transform: 'translateY(0px)' }], { duration: RISE_MS, easing: RISE });
    // The map's buttons appear on it once it has all but landed.
    crown?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 220, easing: 'ease-out', fill: 'backwards' });
  } else {
    // Under the card that is leaving: it is there to be uncovered as that slides away.
    el.animate([{ transform: 'translateY(10px)' }, { transform: 'translateY(0px)' }], { duration: 320, easing: 'cubic-bezier(.22,.61,.36,1)' });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }
}

function leave(el: HTMLElement, crown: HTMLElement | null, kind: StageKind, done: () => void) {
  // Swiped away: it is already moving, so it keeps going rather than easing off from rest.
  const flung = kind === 'card' && sheetFling.value > 0;
  if (kind === 'card') sheetFling.value = 0;
  const from = current(el);
  el.getAnimations().forEach((a) => a.cancel());
  if (crown) {
    const was = Number(getComputedStyle(crown).opacity || 1);
    crown.getAnimations().forEach((a) => a.cancel());
    crown.animate([{ opacity: was }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
  }
  let last: Animation;
  if (still()) {
    last = el.animate([{ opacity: from.opacity }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
  } else if (kind === 'card') {
    const to = `translateY(${el.offsetHeight + 16}px)`;
    last = el.animate([{ transform: from.transform }, { transform: to }], flung ? { duration: 220, easing: 'cubic-bezier(.25,.46,.45,.94)', fill: 'forwards' } : { duration: SINK_MS, easing: SINK, fill: 'forwards' });
    // Solid while it slides, so it reads as a card going down, then gone softly over the last stretch.
    el.animate([{ opacity: from.opacity }, { opacity: from.opacity, offset: 0.45 }, { opacity: 0 }], { duration: flung ? 220 : SINK_MS, easing: 'linear', fill: 'forwards' });
  } else {
    last = el.animate([{ transform: from.transform, opacity: from.opacity }, { transform: 'translateY(10px)', opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' });
  }
  last.onfinish = done;
  last.oncancel = done;
}

export function CardStage({ cardKey, kind, crown, children }: { cardKey: string; kind: StageKind; /** Rides on top of whatever is up: the map's buttons. Given as a function, it is told which card it rides on (its key). */ crown?: Crown; children: React.ReactNode }) {
  const { layers, remove } = useStageLayers(cardKey, kind, children);
  // Each layer's element, and the map's buttons riding on it.
  const els = useRef(new Map<string, HTMLElement>());
  const crowns = useRef(new Map<string, HTMLElement>());
  // Whose entrance and exit have been played: once each, however often the stage redraws meanwhile.
  const entered = useRef(new Set<string>());
  const leaving = useRef(new Set<string>());

  useLayoutEffect(() => {
    for (const layer of layers) {
      const el = els.current.get(layer.id);
      if (!el) continue;
      const top = crowns.current.get(layer.id) ?? null;
      if (!layer.out && !layer.first && !entered.current.has(layer.id)) { entered.current.add(layer.id); enter(el, top, layer.kind); }
      if (layer.out && !leaving.current.has(layer.id)) {
        leaving.current.add(layer.id);
        leave(el, top, layer.kind, () => {
          els.current.delete(layer.id);
          crowns.current.delete(layer.id);
          entered.current.delete(layer.id);
          leaving.current.delete(layer.id);
          remove(layer);
        });
      }
    }
  });

  return (
    <View style={styles.stage}>
      {layers.map((layer: StageLayer) => (
        <View
          key={layer.id}
          ref={(el) => { if (el) els.current.set(layer.id, el as unknown as HTMLElement); }}
          // The bare map's layer always under the cards; the newest card above the one leaving, which no longer takes taps.
          style={[{ zIndex: layerZ(layer) }, layer.out ? styles.out : styles.through]}
        >
          {crown ? (
            <View ref={(el) => { if (el) crowns.current.set(layer.id, el as unknown as HTMLElement); }} style={styles.through}>
              {/* Its own buttons: one on its way out keeps the ones it had (the players list's, faded while it was tall). */}
              {typeof crown === 'function' ? crown(layer.key) : crown}
            </View>
          ) : null}
          {layer.node}
        </View>
      ))}
    </View>
  );
}

// Taps pass through the stage to the map wherever no card or button is (the
// strip above a card, round the map's buttons). In the browser this only
// works from a compiled style: an inline pointerEvents is ignored there
// (react-native-web), which left that strip of map untappable.
const styles = StyleSheet.create({
  // zIndex 0 keeps the layers' own stacking inside the stage (as on the phone); the strip under
  // the tab bar is part of each card, drawn after it, so it always lies over the card's shadow.
  stage: { position: 'relative', zIndex: 0, pointerEvents: 'box-none' },
  through: { pointerEvents: 'box-none' },
  out: { pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: 0 },
});
