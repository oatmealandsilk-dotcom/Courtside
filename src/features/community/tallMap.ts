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
 * (CARD_HEIGHT, the approved first screen's map; Nov 28, owner: "The map should still be large though"); on a phone
 * with more room, as tall as still leaves Open to hit under it (`strip`), whatever else sits under them in the page's
 * head (`under`: "You're at <court>?", with its gap) and the first activity's top (`peek`) above the bar: the map's
 * size wins over the peek. With `short` ("You're early" / "Bring your friends" under them, whose button must show on
 * the first screen, the map 2 review's fix) the map and Open to hit together take the card's height, as the map with
 * Open to hit over its foot did, so that card sits where it did. From the page's own layout only, as useTallMap:
 * `onSlotLayout` on the view that holds the map and Open to hit (a direct child of the section's first column),
 * `onPaneHeight` on the section's PaneScroller; every height it is given is measured on its own, never off the map's.
 * `still` (a search under way, the map laid aside) keeps where the map starts as it was. Undefined until all of it is
 * known (the card's usual height meanwhile).
 */
export function useHomeMap(on: boolean, { peek, strip, stripKnown, under, short, still }: { peek: number; strip: number; stripKnown: boolean; under: number; short: boolean; still: boolean }): { height: number | undefined; onSlotLayout: (e: LayoutChangeEvent) => void; onPaneHeight: (h: number) => void } {
  const barTop = useBarTop();
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
      : Math.max(CARD_HEIGHT, paneH - PANE_TOP - slotY - barTop - under - strip - peek);
  return { height, onSlotLayout, onPaneHeight: setPaneH };
}
