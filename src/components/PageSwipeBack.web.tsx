import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { isPageSwipeLocked, setPageDragging } from '@/features/navigation/swipeLock';

/** How far a finger travels before the page decides whether a drag is its own. */
const SLOP = 10;
/** Let go past this share of the width (or flicked), and the page goes back. */
const COMMIT_AT = 0.35;
/** A flick this fast (px per ms) toward the right goes back however short. */
const FLICK = 0.45;
const EASE = 'cubic-bezier(.2,.8,.25,1)';

/**
 * A page that goes back when dragged to the right from anywhere on it, in a
 * phone's browser (the phone app's version is PageSwipeBack.tsx). The page
 * follows the finger; let go past a third of the way, or with a flick, and
 * it slides off and goes back; let go sooner and it springs into place.
 *
 * Only a drag that is clearly sideways and to the right is taken, so the list
 * still scrolls up and down; one that lands on a strip that scrolls sideways
 * (who is up to hit today) is the strip's, and one a row has already taken
 * (sliding an open row shut) is the row's. Only the page moves (a transform,
 * never its opacity), so the glass over it stays glass.
 */
export function PageSwipeBack({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const wrap = useRef<View>(null);
  const taking = useRef(false);
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    const el = wrap.current as unknown as HTMLElement | null;
    if (!el) return undefined;
    let drag: { id: number; x: number; y: number; taken: boolean; dx: number; t: number; v: number } | null = null;
    let leaving = false;
    const place = (x: number, ms = 0, done?: () => void) => {
      el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      el.style.transform = x ? `translate3d(${x}px,0,0)` : '';
      if (!done) return;
      let called = false;
      const finish = () => { if (called) return; called = true; el.removeEventListener('transitionend', finish); done(); };
      el.addEventListener('transitionend', finish);
      setTimeout(finish, ms + 80);
    };
    const touchOf = (e: TouchEvent, id: number) => Array.from(e.changedTouches).find((t) => t.identifier === id);
    const start = (e: TouchEvent) => {
      if (drag) {
        const held = drag.id;
        // A second finger mid-drag changes nothing: the first one still has the page.
        if (Array.from(e.touches).some((t) => t.identifier === held)) return;
        // The first finger's lift never reached the page: let go of its drag first.
        if (drag.taken) { taking.current = false; setPageDragging(false); place(0, 240); }
        drag = null;
      }
      if (leaving || e.touches.length !== 1 || isPageSwipeLocked()) { drag = null; return; }
      const t = e.touches[0];
      if (scrollsSideways(e.target as HTMLElement | null, el)) { drag = null; return; }
      drag = { id: t.identifier, x: t.clientX, y: t.clientY, taken: false, dx: 0, t: e.timeStamp, v: 0 };
    };
    const move = (e: TouchEvent) => {
      if (!drag) return;
      const t = touchOf(e, drag.id);
      if (!t) return;
      const dx = t.clientX - drag.x;
      const dy = t.clientY - drag.y;
      if (!drag.taken) {
        // A row sliding (an open one closing) has this drag already.
        if (e.defaultPrevented) { drag = null; return; }
        if (dx > SLOP && dx > Math.abs(dy) * 1.4) {
          drag.taken = true;
          taking.current = true;
          setPageDragging(true);
        } else {
          if (Math.abs(dy) > SLOP || dx < -SLOP) drag = null;
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      const x = Math.max(0, dx);
      const dt = e.timeStamp - drag.t;
      if (dt > 0) drag.v = 0.8 * ((x - drag.dx) / dt) + 0.2 * drag.v;
      drag.dx = x; drag.t = e.timeStamp;
      place(x);
    };
    const end = (e: TouchEvent) => {
      if (!drag || !touchOf(e, drag.id)) return;
      const { taken, dx } = drag;
      // A speed counts only if the finger was still moving at the end (held still, then lifted, is not a flick).
      const v = e.timeStamp - drag.t < 100 ? drag.v : 0;
      drag = null;
      if (!taken) return;
      taking.current = false;
      setPageDragging(false);
      const width = el.getBoundingClientRect().width || window.innerWidth;
      if (e.type === 'touchend' && (dx > width * COMMIT_AT || (v > FLICK && dx > 30))) {
        leaving = true;
        place(width, Math.max(140, Math.min(260, ((width - dx) / Math.max(v, 1.4)))), () => {
          latest.current();
          // Still here (nowhere to go back to): put the page back.
          setTimeout(() => { leaving = false; place(0); }, 400);
        });
      } else {
        place(0, 240);
      }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      if (taking.current) setPageDragging(false);
    };
  }, []);

  // Once the page has the finger, whatever it went down on (a row) lets go of its press.
  return <View ref={wrap} style={styles.fill} onMoveShouldSetResponderCapture={() => taking.current}>{children}</View>;
}

/** Whether the finger landed on something that scrolls sideways (a strip), inside the page. */
function scrollsSideways(target: HTMLElement | null, page: HTMLElement): boolean {
  for (let n = target; n && n !== page; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
