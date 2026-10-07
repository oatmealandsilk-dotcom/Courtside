import { useEffect, useState, type RefObject } from 'react';
import { Dimensions, type View } from 'react-native';

/** Room kept clear at the top (the header) and the bottom (the tab bar): a thing under either is not in view yet. */
const TOP = 100;
const BOTTOM = 90;

/**
 * Whether a thing has come into view on a scrolling page: its place on
 * screen is asked a few times a second while `active`, and once its foot is
 * clear of the header and the tab bar it counts as seen, for good, and the
 * asking stops. For a tip that belongs to something far down a page, so it
 * waits for that thing to be seen instead of showing (and using up the
 * visit's one tip) while it is still off screen.
 */
export function useOnScreen(ref: RefObject<View | null>, active: boolean): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!active || seen) return undefined;
    let on = true;
    const check = () => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return;
      node.measureInWindow((_x, y, _w, h) => {
        if (!on || !h) return;
        const foot = y + h;
        if (foot > TOP && foot < Dimensions.get('window').height - BOTTOM) setSeen(true);
      });
    };
    check();
    const timer = setInterval(check, 400);
    return () => { on = false; clearInterval(timer); };
  }, [active, seen, ref]);
  return seen;
}
