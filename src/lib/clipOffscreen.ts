import { Platform } from 'react-native';

import { useTapFast } from '@/features/navigation/pressV2';

/**
 * Rows scrolled well out of sight are taken off the phone's screen list (iOS's own views, not React's), and put back
 * just before they scroll into sight again (Nov 4, owner: "There's still way too much latency delay").
 *
 * Why: before every page slides in, iOS walks every view in all four mounted tabs, twice (lifting the tabs out of the
 * window and back), and again as the page lands and as a swipe back starts; and after every redraw of anything, each
 * scrolling list walks every view inside it. Most of Community's views (about 1,300 of 1,600 on Nov 2) sit far down
 * its lists or off the side of a card strip, out of sight, and were walked every time.
 *
 * How: React Native's own `removeClippedSubviews` on a row container that sits in a scrolling list. A row whose frame
 * is fully outside the list's visible area plus 44 points is detached from the container; it is put back, in its own
 * place in the order, in the same frame the list scrolls it to within 44 points of the edge (the list checks on every
 * 44 points of scroll and after every redraw), so it is always there before any part of it can be seen. Nothing is
 * rebuilt or redrawn by React: the row keeps its views, its state and its animations (nothing replays).
 *
 * Only where it is safe, never on: a pager (the tabs, Find Players / Discussions, the Feed's pages), a row holding
 * the map, a video or a glass view, or a container where a child is drawn over its neighbours (a menu).
 *
 * iOS only (Android has its own, the website has no such views), behind taps answering sooner (TAP_FAST, admins
 * first): it changes when work happens on an iPhone, which no web check can see.
 */
export function useClipOffscreen(): boolean {
  return useTapFast() && Platform.OS === 'ios';
}
