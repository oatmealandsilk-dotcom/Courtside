import { createContext, use } from 'react';

import { useIsFocusedLater } from '@/lib/useIsFocused';
import { useTapFast } from '@/features/navigation/pressV2';

/**
 * Whether the section a part sits in is the one on show inside its page (PaneScroller's `active`: Find Players
 * or Discussions in Community). True outside a section.
 */
export const PaneShownContext = createContext(true);

/**
 * Whether a looping animation (a breathing ring, a live dot) should run now: only while it can be seen, with taps
 * that answer sooner (pressV2's TAP_FAST, admins first); without, always, as before.
 *
 * Why (Nov 3): on a phone every frame of any looping animation, anywhere in the app, has the phone redo its
 * whole screen (the four tabs stay built side by side), whether or not the loop is in sight. On the Simulator
 * that was about a sixth of every second of the main thread with nothing moving, and it sat under every slide,
 * so a slide's own work tipped it into a held frame. A loop out of sight now rests, and starts again from its
 * beginning the moment it is back.
 */
export function useLoopsRun(): boolean {
  const shown = useIsFocusedLater();
  const pane = use(PaneShownContext);
  const fast = useTapFast();
  return !fast || (shown && pane);
}
