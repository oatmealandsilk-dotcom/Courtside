import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type ScrollView, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_HEIGHT } from '@/components/map/cardFit';
import { PANE_TOP } from '@/components/ui/PaneScroller';
import { TAB_BAR_GAP, TAB_BAR_H, useBarInset } from '@/features/navigation/barInset';
import { useBarIg } from '@/features/navigation/barLens';
import { BAR_METRICS, NEW_BAR, newBarFoot } from '@/features/navigation/tabBarLook';
import { useTabActive } from '@/features/navigation/tabFocus';

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
 * The iPhone's Community map (COMMUNITY_MAP_LOOK 'overlay'): how tall it is, from where it starts on Find Players down
 * to the screen's foot, under the bottom bar, the way Apple Maps runs. Read from the page's own layout (where the map
 * sits in the section, where the section's scroller sits on the screen), never from where the page happens to be
 * scrolled, so a section put back half way down still gets the right map. Undefined until read (the card's usual
 * height meanwhile). `onSlotLayout` goes on the view that holds the map, a direct child of the section's first column.
 */
export function useTallMap(scroller: RefObject<ScrollView | null>, on: boolean): { height: number | undefined; onSlotLayout: (e: LayoutChangeEvent) => void } {
  const { height: screenH, fontScale } = useWindowDimensions();
  const active = useTabActive();
  // Where the map starts in the section (under the search box): it moves only with the page's layout (bigger text).
  const [slotY, setSlotY] = useState(0);
  // Where the section's scroller starts on the screen (under the section row): it never scrolls.
  const [paneTop, setPaneTop] = useState(0);
  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const y = Math.round(e.nativeEvent.layout.y);
    // 0 only while it is laid aside (a search under way hides it, out of the page's flow): kept as it was.
    if (y > 0) setSlotY(y);
  }, []);
  useEffect(() => {
    if (!on) return undefined;
    const read = () => {
      const node = scroller.current as unknown as (View & { getNativeScrollRef?: () => View | null }) | null;
      const host = node && typeof node.measureInWindow === 'function' ? node : node?.getNativeScrollRef?.() ?? null;
      host?.measureInWindow((_x, y) => { if (y > 0) setPaneTop(Math.round(y)); });
    };
    read();
    // Once more after the tab's arrival has settled (it may still be sliding in now).
    const t = setTimeout(read, 900);
    return () => clearTimeout(t);
  }, [on, scroller, slotY, fontScale, active]);
  const height = on && paneTop > 0 && slotY > 0 ? Math.max(CARD_HEIGHT, Math.round(screenH - (paneTop + PANE_TOP + slotY))) : undefined;
  return { height, onSlotLayout };
}
