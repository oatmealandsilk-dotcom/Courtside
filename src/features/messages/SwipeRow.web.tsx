import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import * as haptics from '@/lib/haptics';
import { ACTION_W, ROW_SLOP, rowTravel } from './rowSwipe';

const SETTLE = 'transform 260ms cubic-bezier(.2,.8,.25,1)';
const elementOf = (view: View | null) => view as unknown as HTMLElement | null;

/**
 * An inbox row that slides, in a browser (the phone's version is
 * SwipeRow.tsx; the shared numbers are in rowSwipe.ts). A finger or a mouse
 * drag moves it, set straight on the page as the pointer moves; a
 * two-finger sideways swipe on a trackpad works too. Scrolling the list up
 * and down is left to the browser until a drag has gone sideways. A drag to
 * the right on a closed row is left alone: the page's own back swipe has it
 * (PageSwipeBack.web).
 */
export function SwipeRow({ actions, actionCount, open, onOpen, children }: {
  actions: React.ReactNode; actionCount: number;
  open: boolean; onOpen: (open: boolean) => void; children: React.ReactNode;
}) {
  const wrap = useRef<View>(null);
  const body = useRef<View>(null);
  const actionsRef = useRef<View>(null);
  const at = useRef(0);
  const width = actionCount * ACTION_W;
  const latest = useRef({ onOpen, width });
  latest.current = { onOpen, width };
  const swallowClick = useRef(false);
  // The row has the pointer: whatever it went down on lets go of its press.
  const taking = useRef(false);

  const place = (x: number, settle: boolean) => {
    at.current = x;
    const el = elementOf(body.current);
    if (el) { el.style.transition = settle ? SETTLE : 'none'; el.style.transform = x ? `translate3d(${x}px,0,0)` : ''; }
    const a = elementOf(actionsRef.current);
    if (a) { a.style.opacity = x < -4 ? '1' : '0'; hideActions(a, x >= -4); }
  };
  // Closed, the buttons under the row are out of the Tab key's reach and a screen reader's.
  useEffect(() => { const a = elementOf(actionsRef.current); if (a) hideActions(a, true); }, []);
  useEffect(() => { if (!open && at.current !== 0) place(0, true); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = elementOf(wrap.current);
    if (!el) return undefined;
    let drag: { id: number; x: number; y: number; from: number; taken: boolean } | null = null;
    let wheel: { travel: number; timer?: ReturnType<typeof setTimeout> } | null = null;
    // Where the row was when the drag began: coming open from shut gives one light tick (Oct 22 sweep).
    let startedAt = 0;
    const finish = (velocityLeft: boolean) => {
      const x = at.current;
      const openIt = x < -latest.current.width / 2 || (velocityLeft && x < -20);
      if (openIt && startedAt > -latest.current.width + 1) haptics.tap();
      place(openIt ? -latest.current.width : 0, true);
      latest.current.onOpen(openIt);
    };
    const down = (e: PointerEvent) => {
      swallowClick.current = false;
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: at.current, taken: false };
      startedAt = at.current;
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.taken) {
        if (Math.abs(dx) > ROW_SLOP && Math.abs(dx) > Math.abs(dy) * 1.4) {
          // Rightward on a closed row: the page's back swipe.
          if (dx > 0 && at.current === 0) { drag = null; return; }
          drag.taken = true;
          taking.current = true;
          try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        } else {
          if (Math.abs(dy) > ROW_SLOP) drag = null;
          return;
        }
      }
      e.preventDefault();
      place(rowTravel(drag.from + dx, latest.current.width), false);
    };
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const taken = drag.taken;
      drag = null;
      taking.current = false;
      if (!taken) return;
      if (e.pointerType !== 'touch') { swallowClick.current = true; setTimeout(() => { swallowClick.current = false; }, 400); }
      finish(false);
    };
    const click = (e: MouseEvent) => {
      if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
      // A tap on an open row closes it rather than opening the chat.
      if (at.current !== 0 && !(e.target as HTMLElement).closest?.('[data-row-action]')) { e.preventDefault(); e.stopPropagation(); place(0, true); latest.current.onOpen(false); }
    };
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX;
      if (!wheel) {
        if (Math.abs(dx) < 2 || Math.abs(dx) <= Math.abs(e.deltaY) * 1.4) return;
        // Toward the right on a closed row: nothing to uncover.
        if (dx < 0 && at.current === 0) return;
        wheel = { travel: at.current };
        startedAt = at.current;
      }
      e.preventDefault();
      wheel.travel -= dx;
      place(rowTravel(wheel.travel, latest.current.width), false);
      clearTimeout(wheel.timer);
      wheel.timer = setTimeout(() => { wheel = null; finish(false); }, 140);
    };
    // Once the row has the finger, the page must not scroll under it. (Not by touch-action on the
    // row, which kept taps from reaching the row in a phone's browser.)
    const touchMove = (e: TouchEvent) => { if (taking.current && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View ref={wrap} style={styles.wrap} onMoveShouldSetResponderCapture={() => taking.current}>
      <View ref={actionsRef} style={[styles.actions, { width, opacity: 0 }]} {...({ dataSet: { rowAction: '1' } } as object)}>{actions}</View>
      <View ref={body}>{children}</View>
    </View>
  );
}

/** Takes the buttons under a closed row out of the Tab order and away from screen readers (and puts them back). */
function hideActions(el: HTMLElement, hidden: boolean) {
  (el as HTMLElement & { inert: boolean }).inert = hidden;
  if (hidden) el.setAttribute('aria-hidden', 'true');
  else el.removeAttribute('aria-hidden');
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
});
