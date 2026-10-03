import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import {
  AnchorContext, RowTimeContext, TIME_COLUMN, TIME_SLOP, bothRefs, roomBeside, slideFor, timeOpacity, travelFor, type Spot,
} from './timeSwipe';

/*
 * Swipe a chat to the left to see when each message was sent, in a browser
 * (the phone's version is MessageTimes.tsx; the shared numbers are in
 * timeSwipe.ts). A finger on a phone, a mouse or trackpad drag, or a
 * two-finger sideways swipe on a trackpad all slide the messages.
 *
 * The slide is two numbers on the chat's own box, set straight on the page
 * as the pointer moves: every row reads them through the stylesheet below,
 * so one small change per frame moves them all and nothing in React draws
 * again. Your messages move the whole way; someone else's only as far as
 * its time needs (the room beside it is written on the row). On a computer,
 * resting the pointer on a message also shows its time beside it, the way
 * Instagram's website does.
 */

const SETTLE_MS = 320;
// Quick off the mark and soft into place, the way the phone's spring lands.
const EASE = 'cubic-bezier(.2,.8,.25,1)';

const CSS = `
[data-msg-swipe]>*{touch-action:pan-y}
[data-msg-swipe][data-msg-active]{user-select:none;-webkit-user-select:none}
[data-msg-active] [data-msg-mine]{transform:translate3d(var(--msg-slide,0px),0,0);will-change:transform}
[data-msg-active] [data-msg-theirs]{transform:translate3d(min(0px,calc(var(--msg-slide,0px) + var(--msg-free,0px))),0,0)}
[data-msg-time]{opacity:var(--msg-fade,0)}
[data-msg-active] [data-msg-time]{transform:translate3d(var(--msg-slide,0px),0,0);will-change:transform,opacity}
[data-msg-settling] [data-msg-mine],[data-msg-settling] [data-msg-theirs]{transition:transform ${SETTLE_MS}ms ${EASE}}
[data-msg-settling] [data-msg-time]{transition:transform ${SETTLE_MS}ms ${EASE},opacity ${Math.round(SETTLE_MS * 0.7)}ms ease-out}
[data-msg-beside]{opacity:0;transition:opacity 140ms ease-out}
@media (prefers-reduced-motion:reduce){
[data-msg-active] [data-msg-mine],[data-msg-active] [data-msg-theirs],[data-msg-active] [data-msg-time]{transform:none;will-change:auto}
[data-msg-time]{visibility:hidden}
[data-msg-active] [data-msg-beside]{opacity:var(--msg-fade,0);transition:none}
[data-msg-settling] [data-msg-beside]{transition:opacity 200ms ease-out}
}`;

let installed = false;
function installStyles() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** react-native-web writes `dataSet` as data-* attributes; the stylesheet above finds the parts by them. */
const mark = (name: string) => ({ dataSet: { [name]: '1' } }) as object;
/** In a browser a view's ref is its element on the page. */
const elementOf = (view: View | null) => view as unknown as HTMLElement | null;

/**
 * Around the chat's scrolling list. A drag that starts mostly to the left
 * slides the messages; scrolling, a tap, a hold or a drag to the right is
 * left alone. Pointer events are watched on the way down (capture), so a
 * message under the finger never has to pass them on. Off (`enabled`
 * false) while a message's menu or a photo is open over the chat.
 */
export function TimeSwipeArea({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
  const area = useRef<View>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: number; taken: boolean } | null>(null);
  const wheel = useRef<{ travel: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const swallowClick = useRef(false);
  const on = useRef(enabled);
  on.current = enabled;
  useEffect(installStyles, []);

  const place = (slide: number) => {
    const el = elementOf(area.current);
    if (!el) return;
    el.style.setProperty('--msg-slide', `${-slide}px`);
    el.style.setProperty('--msg-fade', String(timeOpacity(slide)));
  };
  /** The slide takes over: messages caught on their way back are picked up where they are. */
  const take = (): number => {
    const el = elementOf(area.current);
    if (!el) return 0;
    clearTimeout(settleTimer.current);
    let now = 0;
    if (el.hasAttribute('data-msg-settling')) {
      // A time moves the whole way, so it says how far the chat is slid.
      const time = el.querySelector('[data-msg-time]');
      const transform = time ? getComputedStyle(time).transform : 'none';
      if (transform && transform !== 'none') now = Math.max(0, -new DOMMatrixReadOnly(transform).m41);
      el.removeAttribute('data-msg-settling');
    }
    el.setAttribute('data-msg-active', '1');
    place(now);
    // A mouse drag starts by selecting the words under it; the slide is not a selection.
    window.getSelection?.()?.removeAllRanges();
    return now;
  };
  const letGo = () => {
    const el = elementOf(area.current);
    if (!el || !el.hasAttribute('data-msg-active')) return;
    el.setAttribute('data-msg-settling', '1');
    place(0);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      el.removeAttribute('data-msg-settling');
      el.removeAttribute('data-msg-active');
    }, SETTLE_MS + 40);
  };

  useEffect(() => {
    const el = elementOf(area.current);
    if (!el) return undefined;
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (!d.taken) return;
      // The press that started a mouse drag must not also open the photo or
      // the court. (A finger's drag is never followed by a click, so nothing
      // is held back after one: the next real tap must go through.)
      if (!cancelled && e.pointerType !== 'touch') {
        swallowClick.current = true;
        setTimeout(() => { swallowClick.current = false; }, 400);
      }
      letGo();
    };
    const down = (e: PointerEvent) => {
      // A new press: whatever a past drag held back is over.
      swallowClick.current = false;
      if (!on.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if ((e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable="true"],video,audio')) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: 0, taken: false };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      // A mouse let go outside the chat (its release never came here): that drag is over.
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) { end(e, true); return; }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.taken) {
        // A hold opened a menu over the chat while the finger stayed down: not this.
        if (!on.current) { drag.current = null; return; }
        // Mostly sideways, to the left: the slide takes it. Up, down or to the right first: not this.
        if (dx < -TIME_SLOP && -dx > Math.abs(dy) * 1.4) {
          d.taken = true;
          d.from = dx + travelFor(take());
          try { el.setPointerCapture(e.pointerId); } catch { /* The pointer may already be gone. */ }
        } else {
          if (dx > TIME_SLOP || Math.abs(dy) > TIME_SLOP) drag.current = null;
          return;
        }
      }
      e.preventDefault();
      place(slideFor(d.from - dx));
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // A photo would otherwise be picked up and dragged off by the mouse.
    const dragStart = (e: DragEvent) => { if (drag.current) e.preventDefault(); };
    // A two-finger swipe to the left on a trackpad: the same slide, back in place once the fingers stop.
    const onWheel = (e: WheelEvent) => {
      if (drag.current?.taken || !on.current) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      let w = wheel.current;
      if (!w) {
        if (dx < 2 || dx <= Math.abs(dy) * 1.4) return;
        w = { travel: travelFor(take()) };
        wheel.current = w;
      }
      // While it is sliding, the list holds still.
      e.preventDefault();
      w.travel = Math.max(0, w.travel + dx);
      place(slideFor(w.travel));
      clearTimeout(w.timer);
      w.timer = setTimeout(() => { wheel.current = null; letGo(); }, 120);
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', cancel, true);
    el.addEventListener('click', click, true);
    el.addEventListener('dragstart', dragStart, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', cancel, true);
      el.removeEventListener('click', click, true);
      el.removeEventListener('dragstart', dragStart, true);
      el.removeEventListener('wheel', onWheel);
      clearTimeout(wheel.current?.timer);
      clearTimeout(settleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Turned off mid-slide (a menu or a photo opened over the chat): the messages go back.
  useEffect(() => {
    if (enabled) return;
    if (drag.current?.taken) letGo();
    drag.current = null;
    if (wheel.current) { clearTimeout(wheel.current.timer); wheel.current = null; letGo(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return (
    <View
      ref={area}
      style={staticStyles.area}
      // Once the slide has the pointer, whatever it went down on (a photo, a
      // card, a bubble) lets go of its press, so it doesn't stay dimmed or
      // pressed in while the chat slides.
      onMoveShouldSetResponderCapture={() => drag.current?.taken === true}
      {...mark('msgSwipe')}
    >
      {children}
    </View>
  );
}

/**
 * Whatever moves with the messages. With `time`, a message's row: its time
 * waits just past the row's right edge and comes into view as the chat
 * slides. Its parent must be the row's own full-width box, which the time
 * is placed against. Without, a part with no time of its own: "Not sent"
 * under yours moves with it; a sender's name or the typing dots, on the
 * other side, stay put.
 */
export function Slide({ time, mine = false, style, children }: {
  time?: string; mine?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  if (time) return <TimedRow time={time} mine={mine} style={style}>{children}</TimedRow>;
  return <View style={style} {...(mine ? mark('msgMine') : null)}>{children}</View>;
}

function TimedRow({ time, mine, style, children }: { time: string; mine: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const rowRef = useRef<View>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const report = useCallback((next: Spot) => setSpot((now) => (
    now && now.x === next.x && now.y === next.y && now.w === next.w && now.h === next.h ? now : next
  )), []);
  const anchor = useMemo(() => ({ row: rowRef, report }), [report]);
  const rowTime = useMemo(() => ({ time, mine }), [time, mine]);
  // Someone else's message moves only as far as its time needs: the room beside it goes on the row for the stylesheet.
  const free = mine ? 0 : roomBeside(spot, rowWidth);
  useEffect(() => {
    const el = elementOf(rowRef.current);
    if (!el) return;
    if (mine) el.style.removeProperty('--msg-free');
    else el.style.setProperty('--msg-free', `${free}px`);
  }, [mine, free]);
  return (
    <>
      <View
        ref={rowRef}
        style={style}
        onLayout={mine ? undefined : (e) => setRowWidth(e.nativeEvent.layout.width)}
        {...mark(mine ? 'msgMine' : 'msgTheirs')}
      >
        <AnchorContext.Provider value={anchor}>
          <RowTimeContext.Provider value={rowTime}>{children}</RowTimeContext.Provider>
        </AnchorContext.Provider>
      </View>
      <View aria-hidden style={[styles.column, spot ? { top: spot.y, height: spot.h } : styles.columnFill]} {...mark('msgTime')}>
        <Text style={styles.time} numberOfLines={1}>{time}</Text>
      </View>
    </>
  );
}

/**
 * The box a message's bubble (or photos, or card) sits in. It tells its row
 * where it is, so the time lines up with it, and holds the time shown beside
 * it under Reduce Motion while sliding. (No time on hover: the swipe shows them, Oct 2.)
 */
export function TimeAnchor({ ref, style, children }: { ref?: React.Ref<View>; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const anchor = useContext(AnchorContext);
  const row = useContext(RowTimeContext);
  const own = useRef<View>(null);
  const setRef = useMemo(() => bothRefs(ref, own), [ref]);
  const measure = anchor ? () => {
    const node = own.current;
    const base = anchor.row.current;
    if (!node || !base) return;
    node.measureLayout(base, (x, y, w, h) => anchor.report({ x, y, w, h }), () => undefined);
  } : undefined;
  return (
    <View ref={setRef} collapsable={false} style={style} onLayout={measure}>
      {children}
      {row ? (
        <View aria-hidden style={[styles.beside, row.mine ? styles.besideMine : styles.besideTheirs]} {...mark('msgBeside')}>
          <Text style={[styles.time, !row.mine && styles.timeStart]} numberOfLines={1}>{row.time}</Text>
        </View>
      ) : null}
    </View>
  );
}

const staticStyles = StyleSheet.create({
  area: { flex: 1, minHeight: 0, minWidth: 0 },
});

const styleDefinitions = StyleSheet.create({
  // Just past the row's right edge, as wide as the slide: in view, right-aligned, once the chat has slid over.
  column: { position: 'absolute', pointerEvents: 'none', left: '100%', width: TIME_COLUMN, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 6 },
  columnFill: { top: 0, bottom: 0 },
  time: { ...font('400'), fontSize: 12, lineHeight: 16, letterSpacing: 0, color: colors.textFaint, fontVariant: ['tabular-nums'], textAlign: 'right' },
  timeStart: { textAlign: 'left' },
  beside: { position: 'absolute', pointerEvents: 'none', top: 0, bottom: 0, width: 72, justifyContent: 'center' },
  besideMine: { right: '100%', paddingRight: 8, alignItems: 'flex-end' },
  besideTheirs: { left: '100%', paddingLeft: 8, alignItems: 'flex-start' },
});
