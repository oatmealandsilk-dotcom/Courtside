import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import * as haptics from '@/lib/haptics';
import { ACTION_W, FIRE_AT, ROW_EDGE, ROW_SLOP, rowTravel } from './rowSwipe';

const SETTLE = 'transform 260ms cubic-bezier(.2,.8,.25,1)';
const elementOf = (view: View | null) => view as unknown as HTMLElement | null;

/**
 * An inbox row that slides, in a browser (the phone's version is
 * SwipeRow.tsx; the shared numbers are in rowSwipe.ts). A finger or a mouse
 * drag moves it, set straight on the page as the pointer moves; a
 * two-finger sideways swipe on a trackpad works too. Scrolling the list up
 * and down is left to the browser until a drag has gone sideways.
 */
export function SwipeRow({ actions, actionCount, mark, onMark, open, onOpen, children }: {
  actions: React.ReactNode; actionCount: number; mark: React.ReactNode; onMark: () => void;
  open: boolean; onOpen: (open: boolean) => void; children: React.ReactNode;
}) {
  const wrap = useRef<View>(null);
  const body = useRef<View>(null);
  const markRef = useRef<View>(null);
  const actionsRef = useRef<View>(null);
  const at = useRef(0);
  const width = actionCount * ACTION_W;
  const latest = useRef({ onMark, onOpen, width });
  latest.current = { onMark, onOpen, width };
  const swallowClick = useRef(false);
  // The row has the pointer: whatever it went down on lets go of its press.
  const taking = useRef(false);

  const place = (x: number, settle: boolean) => {
    at.current = x;
    const el = elementOf(body.current);
    if (el) { el.style.transition = settle ? SETTLE : 'none'; el.style.transform = x ? `translate3d(${x}px,0,0)` : ''; }
    const m = elementOf(markRef.current);
    if (m) { const show = Math.min(1, Math.max(0, x / FIRE_AT)); m.style.opacity = String(show); m.style.transform = `scale(${x >= FIRE_AT ? 1.08 : 0.85 + 0.15 * show})`; }
    const a = elementOf(actionsRef.current);
    if (a) a.style.opacity = x < -4 ? '1' : '0';
  };
  useEffect(() => { if (!open && at.current !== 0) place(0, true); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = elementOf(wrap.current);
    if (!el) return undefined;
    let drag: { id: number; x: number; y: number; from: number; taken: boolean; armed: boolean } | null = null;
    let wheel: { travel: number; timer?: ReturnType<typeof setTimeout> } | null = null;
    const finish = (velocityLeft: boolean) => {
      const x = at.current;
      if (x >= FIRE_AT) { latest.current.onMark(); place(0, true); latest.current.onOpen(false); return; }
      const openIt = x < -latest.current.width / 2 || (velocityLeft && x < -20);
      place(openIt ? -latest.current.width : 0, true);
      latest.current.onOpen(openIt);
    };
    const down = (e: PointerEvent) => {
      swallowClick.current = false;
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: at.current, taken: false, armed: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.taken) {
        if (Math.abs(dx) > ROW_SLOP && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx > 0 && drag.x < ROW_EDGE && at.current === 0) { drag = null; return; }
          drag.taken = true;
          taking.current = true;
          try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        } else {
          if (Math.abs(dy) > ROW_SLOP) drag = null;
          return;
        }
      }
      e.preventDefault();
      const x = rowTravel(drag.from + dx, latest.current.width, FIRE_AT + 30);
      const armed = x >= FIRE_AT;
      if (armed !== drag.armed) { drag.armed = armed; if (armed) haptics.tap(); }
      place(x, false);
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
        wheel = { travel: at.current };
      }
      e.preventDefault();
      wheel.travel -= dx;
      place(rowTravel(wheel.travel, latest.current.width, FIRE_AT + 30), false);
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
      <View ref={markRef} pointerEvents="none" style={[styles.mark, { opacity: 0 }]}>{mark}</View>
      <View ref={actionsRef} style={[styles.actions, { width, opacity: 0 }]} {...({ dataSet: { rowAction: '1' } } as object)}>{actions}</View>
      <View ref={body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  mark: { position: 'absolute', left: 0, top: 0, bottom: 0, width: FIRE_AT + 30, alignItems: 'center', justifyContent: 'center' },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
});
