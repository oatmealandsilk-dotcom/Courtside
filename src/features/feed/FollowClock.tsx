import React, { useSyncExternalStore } from 'react';
import { StatusBar } from 'expo-status-bar';

import type { HeadStore } from './swipeFollow';

/**
 * The phone's clock and battery over the Feed, with the swipe followed (features/feed/swipeFollow):
 * white over a picture page, the theme's own over a written one, as before, but turning once, as a
 * swipe is decided, to the look of the page it heads for (the phone's own fade), not once that page
 * has landed. A swipe that springs back never turns it.
 *
 * A component of its own, so only it draws again as a swipe is decided, never the Feed.
 */
export function FollowClock({ rest, head, lightAt }: {
  /** White at rest: the page on show is a picture whose picture is in (the Feed's own rule). */
  rest: boolean;
  /** The page a decided swipe heads for (the pager's onHead). */
  head: HeadStore;
  /** The same rule for the page at that place in the feed. */
  lightAt: (index: number) => boolean;
}) {
  const heading = useSyncExternalStore(head.subscribe, head.get, head.get);
  const light = heading === null ? rest : lightAt(heading);
  return light ? <StatusBar style="light" animated /> : null;
}
