import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState, useTransition } from 'react';
import { View, type ViewStyle } from 'react-native';

import * as haptics from '@/lib/haptics';
import { KNOB_COLOR, KNOB_SHADOW, TOGGLE, TRAVEL, trackOff, trackOn } from './toggleLook';

const { W, H, KNOB, PAD, STRETCH } = TOGGLE;
/**
 * The browser eases these itself, off the page's busy thread: the knob on a
 * soft spring-like curve that settles with a breath of overshoot, the
 * track's colour fading across beside it. react-native-web passes them through.
 */
const css = (style: Record<string, unknown>) => style as unknown as ViewStyle;
/** Reduce Motion on: the knob still moves (that is the switch's meaning), quickly and with no overshoot. */
const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const KNOB_GLIDE = 'transform 360ms cubic-bezier(0.3, 1.32, 0.52, 1), width 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
const KNOB_STILL = 'transform 140ms ease-out, width 140ms ease-out';
const TRACK_FADE = 'background-color 260ms ease, opacity 150ms ease';

/**
 * The switch, drawn by us in a browser, matching the phone's (Toggle.tsx):
 * off is a quiet groove with a white knob, on is the court's colour (or
 * `tint`). Click, tap, Space or Enter flips it; a finger or the mouse can
 * also drag the knob across. A finger on it stretches the knob a little,
 * like a phone's switch.
 *
 * The knob moves on the very frame it is clicked: the screen's own work
 * (which can be heavy: the whole map redraws for Open to hit) waits its turn
 * as a transition, so the switch never waits on it. The screen's `value`
 * still has the last word: a change it refuses or holds back sends the knob
 * back where `value` says. Its clicks and keys stop here, so a row that
 * holds a switch never flips it a second time.
 */
export function Toggle({ value, onChange, disabled = false, accessibilityLabel, haptic = false, tint }: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  haptic?: boolean;
  /** The on colour, when not the court's own. */
  tint?: string;
}) {
  useTheme();
  const [pressed, setPressed] = useState(false);
  // While the knob is being dragged: where it is, 0 (off) to 1 (on).
  const [drag, setDrag] = useState<number | null>(null);
  const dragNow = useRef<number | null>(null);
  const start = useRef<{ x: number; from: number; moved: boolean } | null>(null);
  // A drag ends in a click too; that click is the drag's, not a second flip.
  const swallowClick = useRef(false);
  // Where the knob shows, flipped the moment it is clicked; and where it is headed,
  // so a second click before the screen has caught up flips it back rather than repeating the first.
  const [shown, setShown] = useState(value);
  const aim = useRef(value);
  const [answering, startTransition] = useTransition();
  // The screen has drawn its answer (or changed the value itself): the knob goes where the value says.
  useEffect(() => {
    if (answering) return;
    aim.current = value;
    setShown(value);
  }, [answering, value]);

  const flip = (next: boolean) => {
    aim.current = next;
    setShown(next);
    setPressed(false);
    if (haptic) (next ? haptics.tap : haptics.untap)();
    startTransition(() => onChange(next));
  };
  const p = drag ?? (shown ? 1 : 0);
  const extra = pressed && !disabled ? STRETCH : 0;
  const x = p * (TRAVEL - extra);
  const end = (released: boolean) => {
    const s = start.current;
    start.current = null;
    if (!s?.moved) {
      // A tap: the click that follows flips it, in the same moment as the knob lets go
      // (and should no click follow, the knob still lets go a moment later).
      if (!released) setPressed(false);
      else setTimeout(() => setPressed(false), 300);
      return;
    }
    swallowClick.current = true;
    const at = dragNow.current ?? s.from;
    dragNow.current = null;
    setDrag(null);
    const on = at >= 0.5;
    if (released && on !== aim.current) flip(on);
    else setPressed(false);
  };

  return (
    <View
      accessibilityRole="switch"
      accessibilityState={{ checked: shown, disabled }}
      aria-checked={shown}
      aria-disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      focusable={!disabled}
      {...({
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (swallowClick.current) { swallowClick.current = false; setPressed(false); return; }
          if (disabled) return;
          flip(!aim.current);
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (disabled || (e.key !== ' ' && e.key !== 'Enter')) return;
          e.preventDefault();
          e.stopPropagation();
          flip(!aim.current);
        },
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if (disabled || e.button > 0) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* An old browser drags without capture. */ }
          start.current = { x: e.clientX, from: aim.current ? 1 : 0, moved: false };
          swallowClick.current = false;
          setPressed(true);
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) < 4) return;
          s.moved = true;
          const next = Math.min(1, Math.max(0, s.from + dx / TRAVEL));
          dragNow.current = next;
          setDrag(next);
        },
        onPointerUp: () => end(true),
        onPointerCancel: () => end(false),
      } as object)}
      style={css({
        width: W, height: H, borderRadius: H / 2, padding: PAD,
        backgroundColor: p >= 0.5 ? trackOn(tint) : trackOff(),
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        // Sideways belongs to the knob; up and down still scroll the page.
        touchAction: 'pan-y',
        userSelect: 'none',
        transition: TRACK_FADE,
      })}
    >
      <View
        style={css({
          width: KNOB + extra, height: KNOB, borderRadius: KNOB / 2,
          backgroundColor: KNOB_COLOR,
          boxShadow: KNOB_SHADOW,
          transform: [{ translateX: x }],
          // Under the finger it follows exactly; let go, and it glides home.
          transition: drag !== null ? 'width 200ms ease' : still() ? KNOB_STILL : KNOB_GLIDE,
        })}
      />
    </View>
  );
}
