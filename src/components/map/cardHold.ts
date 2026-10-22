import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Dimensions, type View } from 'react-native';

import type { LatLng } from '@/features/players/positions';

/**
 * Where the still card is centred, held still while it is being looked at
 * (Oct 22, owner: "The map blips in 50% of the time"). Your location usually
 * lands a second or two after the app opens; it used to move the card to your
 * town the instant it arrived, even with the card on screen: the map jumped to
 * streets not drawn yet, blank, then filled in, and the name, counts and pins
 * changed in the same frame. Now a new fix moves the card only while nobody can
 * see it (before it has drawn, under the opening curtain, the section or tab
 * off to the side, the app in the background); otherwise it waits, checked a
 * few times a second, and is applied the moment the card is out of view.
 * Switching Location on or off, or asking for your location from the card, is
 * yours to see happen, so it applies at once as before.
 *
 * Scrolled off the screen counts as out of view too (useCardOnScreen), so a fix
 * held while you read the list under the card lands while the card is away.
 *
 * `seen()`: whether the card is drawn (or showing its picture) and in view right now.
 */
export function useHeldCardPlace(expanded: boolean, at: LatLng | null | undefined, locationOn: boolean, locating: boolean, seen: () => boolean): { at: LatLng | null; locationOn: boolean } {
  const live = { at: at ?? null, locationOn };
  const liveNow = useRef(live);
  liveNow.current = live;
  const seenNow = useRef(seen);
  seenNow.current = seen;
  const [held, setHeld] = useState(live);
  // Asked for from the card (its Location button): that move is meant to be seen.
  const askedAt = useRef(0);
  if (locating) askedAt.current = Date.now();
  const same = held.locationOn === live.locationOn && held.at?.lat === live.at?.lat && held.at?.lng === live.at?.lng;
  useEffect(() => {
    if (expanded || same) return undefined;
    const yours = held.locationOn !== live.locationOn || Date.now() - askedAt.current < 15_000;
    if (yours || !seenNow.current()) { setHeld(live); return undefined; }
    const t = setInterval(() => { if (!seenNow.current()) setHeld(liveNow.current); }, 400);
    return () => clearInterval(t);
  }, [expanded, same, live.locationOn, live.at?.lat, live.at?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return expanded ? live : held;
}

/**
 * Whether the card is within the screen right now (not scrolled away above or below, not slid off to
 * the side), for the card's root view (`ref`). In a browser it is read there and then; on the phone it
 * is measured as it is asked, and an answer older than 0.6 s counts as on screen, so a stale answer
 * can only ever make the card more careful (a fade rather than a cut), never less.
 */
export function useCardOnScreen(): { ref: MutableRefObject<View | null>; onScreen: () => boolean } {
  const ref = useRef<View | null>(null);
  const last = useRef({ on: true, at: 0 });
  const onScreen = useRef(() => {
    const node = ref.current as unknown as { getBoundingClientRect?: () => DOMRect; measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    if (!node) return true;
    const { width: W, height: H } = Dimensions.get('window');
    const within = (x: number, y: number, w: number, h: number) => w > 0 && h > 0 && y + h > 0 && y < H && x + w > 0 && x < W;
    if (typeof node.getBoundingClientRect === 'function') {
      const r = node.getBoundingClientRect();
      return within(r.left, r.top, r.width, r.height);
    }
    node.measureInWindow?.((x, y, w, h) => { last.current = { on: within(x, y, w, h), at: Date.now() }; });
    return Date.now() - last.current.at < 600 ? last.current.on : true;
  });
  return { ref, onScreen: onScreen.current };
}
