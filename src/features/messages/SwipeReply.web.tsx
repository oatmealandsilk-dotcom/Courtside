import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { colors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { EDGE, REPLY_AT, REPLY_SLOP, arrowShow, replyTravel } from './replySwipe';

const SETTLE_MS = 260;
const EASE = 'cubic-bezier(.2,.8,.25,1)';

/** In a browser a view's ref is its element on the page. */
const elementOf = (view: View | null) => view as unknown as HTMLElement | null;

/**
 * Swipe a message to the right to answer it, in a browser (the phone's
 * version is SwipeReply.tsx; the shared numbers are in replySwipe.ts). A
 * finger or a mouse drag that starts mostly to the right moves the message
 * and shows the reply arrow; letting go past REPLY_AT replies. The message
 * and the arrow are moved straight on the page as the pointer moves, so
 * nothing in React draws again during the drag. A drag to the left is the
 * times' swipe (MessageTimes.web), which watches the same pointer on the way
 * down and lets go of it as soon as it heads right.
 */
export function SwipeReply({ enabled = true, onReply, children }: { enabled?: boolean; onReply: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const wrap = useRef<View>(null);
  const body = useRef<View>(null);
  const arrow = useRef<View>(null);
  const drag = useRef<{ id: number; x: number; y: number; taken: boolean; armed: boolean; at: number } | null>(null);
  const swallowClick = useRef(false);
  const latest = useRef(onReply);
  latest.current = onReply;

  useEffect(() => {
    const el = elementOf(wrap.current);
    if (!el || !enabled) return undefined;
    const move = (at: number, settle: boolean) => {
      const content = elementOf(body.current);
      const mark = elementOf(arrow.current);
      const show = arrowShow(at);
      for (const node of [content, mark]) if (node) node.style.transition = settle ? `transform ${SETTLE_MS}ms ${EASE}, opacity ${SETTLE_MS}ms ease-out` : 'none';
      if (content) content.style.transform = at ? `translate3d(${at}px,0,0)` : '';
      if (mark) {
        mark.style.opacity = String(show);
        mark.style.transform = `scale(${0.55 + 0.45 * show + (at >= REPLY_AT ? 0.08 : 0)})`;
      }
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (!d.taken) return;
      if (!cancelled && e.pointerType !== 'touch') {
        swallowClick.current = true;
        setTimeout(() => { swallowClick.current = false; }, 400);
      }
      move(0, true);
      if (d.armed && !cancelled) latest.current();
    };
    const down = (e: PointerEvent) => {
      swallowClick.current = false;
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.clientX < EDGE) return;
      if ((e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable="true"],video,audio')) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, taken: false, armed: false, at: 0 };
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) { end(e, true); return; }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.taken) {
        if (dx > REPLY_SLOP && dx > Math.abs(dy) * 1.4) {
          d.taken = true;
          try { el.setPointerCapture(e.pointerId); } catch { /* The pointer may already be gone. */ }
          window.getSelection?.()?.removeAllRanges();
        } else {
          if (dx < -REPLY_SLOP || Math.abs(dy) > REPLY_SLOP) drag.current = null;
          return;
        }
      }
      e.preventDefault();
      d.at = replyTravel(dx - REPLY_SLOP);
      const armed = d.at >= REPLY_AT;
      if (armed !== d.armed) { d.armed = armed; if (armed) haptics.tap(); }
      move(d.at, false);
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('click', click, true);
    };
  }, [enabled]);

  // The same wrapper on or off: a message going from "Sending…" to sent keeps everything inside it as it was.
  return (
    <View
      ref={wrap}
      style={styles.wrap}
      // Once the swipe has the pointer, whatever it went down on (a bubble, a card) lets go of its press.
      onMoveShouldSetResponderCapture={() => drag.current?.taken === true}
    >
      <View ref={arrow} pointerEvents="none" style={[styles.arrow, { opacity: 0 }]}>
        <View style={styles.arrowDisc}><Ionicons name="arrow-undo" size={15} color={colors.textMuted} /></View>
      </View>
      <View ref={body}>{children}</View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { width: '100%' },
  arrow: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  arrowDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
