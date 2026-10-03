import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

export type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

/*
 * The room under a chat's typing bar, in a browser (the phone's version is
 * keyboardLift.ts). A phone browser's keyboard covers the bottom of the page
 * without telling the layout; the visible area's size says how much, and
 * the bar sits right on it. With the keyboard down, the bar rests a little
 * above the bottom edge.
 */

export function useKeyboardLift({ rest, emojiRoom }: KeyboardLiftOptions): KeyboardLift {
  const [covered, setCovered] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const update = () => setCovered(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  const holdUntilKeyboard = useCallback((_height: number) => undefined, []);
  return { spacer: { height: Math.max(rest, covered, emojiRoom) }, holdUntilKeyboard };
}

/**
 * A finger dragging the messages down lets go of the box, so a phone
 * browser's keyboard goes away (a browser cannot make it follow the finger).
 * A drag up, or sideways for the times, leaves it be. (`_closePanel`, the
 * phone's way of closing only the emoji keyboard, is not needed: here the
 * drag lets go of everything, which closes it too.)
 */
export function useDragDownDismiss(blur: () => void, _closePanel: () => void = blur): DragDismiss {
  const from = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(blur);
  latest.current = blur;
  return useMemo<DragDismiss>(() => ({
    props: {
      onTouchStart: (e) => {
        const t = e.nativeEvent.touches[0];
        from.current = t ? { x: t.pageX, y: t.pageY } : null;
      },
      onTouchMove: (e) => {
        const t = e.nativeEvent.touches[0];
        const start = from.current;
        if (!t || !start) return;
        const dy = t.pageY - start.y;
        if (dy > 28 && dy > Math.abs(t.pageX - start.x) * 1.4) { from.current = null; latest.current(); }
      },
      onTouchEnd: () => { from.current = null; },
    },
    onScrollY: () => undefined,
  }), []);
}
