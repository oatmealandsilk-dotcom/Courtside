import { useCallback, useRef, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_HEIGHT } from '@/components/map/cardFit';
import { PANE_TOP } from '@/components/ui/PaneScroller';
import { TAB_BAR_GAP, TAB_BAR_H, useBarInset } from '@/features/navigation/barInset';
import { useBarIg } from '@/features/navigation/barLens';
import { BAR_METRICS, NEW_BAR, newBarFoot } from '@/features/navigation/tabBarLook';

/**
 * How high today's bottom bar stands above the screen's bottom edge on a phone (its top), with the live session's bar
 * over it while that is on show: the quiet pill for most (BAR_METRICS), the new bar for those who have it (NEW_BAR,
 * admins first: barLens), exactly as NavBar draws them. 0 where no bar floats over the page (a computer's sidebar).
 */
export function useBarTop(): number {
  const inset = useBarInset();
  const newBar = useBarIg();
  const { bottom } = useSafeAreaInsets();
  if (!inset) return 0;
  // NavBar's own foot for the bar: the phone's bottom strip, or 12 where there is none.
  const foot = Math.max(bottom, 12);
  const live = Math.max(0, inset - (TAB_BAR_H + TAB_BAR_GAP + foot));
  return (newBar ? newBarFoot(foot) + NEW_BAR.height : foot + BAR_METRICS.height) + live;
}

/**
 * The iPhone's Community map (COMMUNITY_MAP_LOOK 'overlay'): how tall it is, from where it starts on Find Players
 * (under the search box) down to the section's foot, which is the screen's foot, under the floating bottom bar, the way
 * Apple Maps runs. From the page's own layout only (the section's height on the screen, where the map sits in it), never
 * from where the page happens to be scrolled or how it is moving, so a section put back half way down, or still settling
 * in as the app opens, gets the right map all the same. Undefined until both are known (the card's usual height meanwhile).
 * `onSlotLayout` goes on the view that holds the map (a direct child of the section's first column), `onPaneHeight` on
 * the section's PaneScroller.
 */
export function useTallMap(on: boolean): { height: number | undefined; onSlotLayout: (e: LayoutChangeEvent) => void; onPaneHeight: (h: number) => void } {
  // Where the map starts in the section: it moves only with the page's layout (bigger text, say).
  const [slotY, setSlotY] = useState(0);
  // The section's own height on the screen (from under the section row to the screen's foot).
  const [paneH, setPaneH] = useState(0);
  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const y = Math.round(e.nativeEvent.layout.y);
    // 0 only while it is laid aside (a search under way hides it, out of the page's flow): kept as it was.
    if (y > 0) setSlotY(y);
  }, []);
  const height = on && paneH > 0 && slotY > 0 ? Math.max(CARD_HEIGHT, paneH - PANE_TOP - slotY) : undefined;
  return { height, onSlotLayout, onPaneHeight: setPaneH };
}

/** "You're early" up (`short`): the map's least height, the card's height less Open to hit's under it. */
const HOME_MAP_MIN = 220;

/**
 * The iPhone's first page (HOME_LOOK 'map-feed'): how tall the map is. At least the map card's usual height
 * (CARD_HEIGHT; Nov 28, owner: "The map should still be large though"): exactly as tall as the approved first screen's
 * map with Open to hit over its foot was (home-1.png, and strip-under-map-big.png's, design/home-map-feed's HomeMap),
 * that is from where it starts down to the bar's room (useBarInset: the pill, its gap and the phone's bottom strip,
 * as that design measured it) less the first activity's top (`peek`) and whatever else sits under it in the page's
 * head (`under`: "You're at <court>?", with its gap), never under the card's height. Open to hit under it then takes its room out of the activity's peek: the map's
 * size wins over the peek. With `short` ("You're early" / "Bring your friends" under them, whose button must show on
 * the first screen, the map 2 review's fix) the map and Open to hit together take the card's height, as the map with
 * Open to hit over its foot did, so that card sits where it did. From the page's own layout only, as useTallMap:
 * `onSlotLayout` on the view that holds the map and Open to hit (a direct child of the section's first column),
 * `onPaneHeight` on the section's PaneScroller; every height it is given is measured on its own, never off the map's.
 * `still` (a search under way, the map laid aside) keeps where the map starts as it was. Undefined until all of it is
 * known (the card's usual height meanwhile).
 */
export function useHomeMap(on: boolean, { peek, strip, stripKnown, under, short, still }: { peek: number; strip: number; stripKnown: boolean; under: number; short: boolean; still: boolean }): { height: number | undefined; onSlotLayout: (e: LayoutChangeEvent) => void; onPaneHeight: (h: number) => void } {
  const barInset = useBarInset();
  const [slotY, setSlotY] = useState(0);
  const [paneH, setPaneH] = useState(0);
  const stillRef = useRef(still);
  stillRef.current = still;
  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const y = Math.round(e.nativeEvent.layout.y);
    // 0 only while it is laid aside (a search under way hides it, out of the page's flow): kept as it was.
    if (y > 0 && !stillRef.current) setSlotY(y);
  }, []);
  const ready = on && paneH > 0 && slotY > 0 && stripKnown;
  const height = !ready ? undefined
    : short ? Math.max(HOME_MAP_MIN, CARD_HEIGHT - strip)
      : Math.max(CARD_HEIGHT, paneH - PANE_TOP - slotY - barInset - under - peek);
  return { height, onSlotLayout, onPaneHeight: setPaneH };
}

/** Take A's least map: under it the first activity's name and the top of its photo still show (design/home-discover). */
const PEEK_MAP_MIN = 300;
/** Take C's least map. */
const HEADING_MAP_MIN = 360;

/**
 * PICTURES ONLY (design/home-discover, EXPO_PUBLIC_HOME_DISCOVER): the map's height on Community as one page (no
 * "Find Players | Discussions" row), for each take, from the page's own layout as useHomeMap.
 *  - 'a' Peek: as tall as it can be while Open to hit, then the first activity's name row and the top of its photo
 *    (`peek`), show above the bar.
 *  - 'b' Sheet: down to the screen's foot, under the bar; the sheet rests over its foot (`rest`: the bar's room, the
 *    grab handle, Open to hit and the first activity's header) and rises `full` points to cover the page.
 *  - 'c' Heading: as tall as it can be while Open to hit and the "Friends' activity" heading (`peek`) show above the bar.
 * With `short` ("You're early" / "Bring your friends" up) all three keep useHomeMap's card-height rule.
 */
export function useDiscoverMap(look: 'a' | 'b' | 'c' | null, { peek, strip, stripKnown, under, short, still, rest }: { peek: number; strip: number; stripKnown: boolean; under: number; short: boolean; still: boolean; rest: number }): { height: number | undefined; full: number; onSlotLayout: (e: LayoutChangeEvent) => void; onPaneHeight: (h: number) => void } {
  const barInset = useBarInset();
  const [slotY, setSlotY] = useState(0);
  const [paneH, setPaneH] = useState(0);
  const stillRef = useRef(still);
  stillRef.current = still;
  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const y = Math.round(e.nativeEvent.layout.y);
    if (y > 0 && !stillRef.current) setSlotY(y);
  }, []);
  const ready = look !== null && paneH > 0 && slotY > 0 && stripKnown;
  const room = paneH - PANE_TOP - slotY;
  const height = !ready ? undefined
    : short ? Math.max(HOME_MAP_MIN, CARD_HEIGHT - strip)
      : look === 'b' ? room
        : Math.max(look === 'a' ? PEEK_MAP_MIN : HEADING_MAP_MIN, room - barInset - under - strip - peek);
  // The sheet's top at rest sits `rest + barInset` above the screen's foot; fully up, at the page's top.
  const full = ready && look === 'b' && !short ? Math.max(0, paneH - barInset - rest) : 0;
  return { height, full, onSlotLayout, onPaneHeight: setPaneH };
}
