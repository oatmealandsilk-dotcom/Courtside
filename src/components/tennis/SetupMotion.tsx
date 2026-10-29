import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CountUp } from '@/components/session/CountUp';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { InText, InView, OutText, SOFT_MS, SWAP_HOLD_MS, SWAP_MS, type InWay, type OutWay } from './softLayer';

/*
 * The sign-up's live card in motion (ONBOARDING_V2, Oct 29, owner: "3-4 should maybe update the card when you
 * type or select something, it should be smooth and nice animations"). Each piece of the card that changes as
 * they type or tap changes softly, in its own fixed slot, so nothing beside it jumps:
 *
 * - SoftText: a word in a slot as wide as its line. Letters typed after the old ones fade in while the old ones
 *   stay put; letters taken away fade out; anything else (a town picked, a level, the backhand) is a swap: the
 *   old word goes first, then the new one rises 3pt into place (softLayer: one after the other, never both at
 *   once). `whole` always swaps (the avatar's initials, centred, so an added letter moves the rest).
 * - GlideText: a word with something after it on its line (the style, the hand, the surface): the same swap,
 *   its width easing to the new word's as the new one comes in, so what follows glides rather than jumps or
 *   dissolves.
 * - SoftSwap: the avatar's disc taking a new colour: the new disc grows in on top of the old, which stays fully
 *   drawn under it until it is covered, so the disc never shows through lighter.
 * - EaseSwatch: the surface colour easing to the new one.
 * - RollRating: the rating counting to the new number, in a slot as wide as the system's widest.
 *
 * Ease-out, nothing bouncy, a swap done in SWAP_MS (260ms). Only words, a swatch and an avatar fade here: no
 * glass or blur is under any of them. Reduce Motion is handled as the rest of the app (useReducedMotion).
 * The old layer stays in React only for its way out, then goes; at rest each piece is plain text.
 */

const EASE = Easing.out(Easing.cubic);
/** How long an old layer is kept after a change: the whole swap, and a frame or two to spare. */
const KEEP_MS = SWAP_MS + 40;

type Way = { in: InWay | null; out: OutWay | null };

const SWAP: Way = { in: 'rise', out: 'quick' };

/** How a word changes to the next: letters added fade in (the old ones held), letters taken away fade out, anything else swaps. */
function wayOf(was: string, now: string, sameInk: boolean): Way {
  if (sameInk && was && now.startsWith(was)) return { in: 'fade', out: null };
  if (sameInk && now && was.startsWith(now)) return { in: null, out: 'fade' };
  return SWAP;
}

interface Swap<T> { now: T; was: T | null; n: number; way: Way | null }

/**
 * The value on show and the one on its way out. A change is swapped in during the same draw (React redraws
 * before anything reaches the screen), so the new layer is in its starting place from its first frame.
 */
function useSwap<T>(value: T, same: (a: T, b: T) => boolean, way: (was: T, now: T) => Way) {
  const still = useReducedMotion();
  const [s, set] = useState<Swap<T>>({ now: value, was: null, n: 0, way: null });
  if (!same(s.now, value)) set({ now: value, was: still ? null : s.now, n: s.n + 1, way: still ? null : way(s.now, value) });
  const moving = s.way !== null;
  useEffect(() => {
    if (!moving) return undefined;
    const t = setTimeout(() => set((x) => (x.n === s.n ? { ...x, was: null, way: null } : x)), KEEP_MS);
    return () => clearTimeout(t);
  }, [moving, s.n]);
  return s;
}

interface Ink { text: string; color: string }
const sameInk = (a: Ink, b: Ink) => a.text === b.text && a.color === b.color;

/** A word in a slot as wide as its line (a name, a town, a level): see the top of the file. */
export function SoftText({ text, color, style, slot, whole, maxFontSizeMultiplier }: {
  text: string;
  color: string;
  style: StyleProp<TextStyle>;
  /** The slot's own layout in its row (a town after the handle: flex 1). */
  slot?: StyleProp<ViewStyle>;
  /** Every change a swap (centred initials, where letters added move the ones there). */
  whole?: boolean;
  maxFontSizeMultiplier?: number;
}) {
  const s = useSwap<Ink>({ text, color }, sameInk, (was, now) => (whole ? SWAP : wayOf(was.text, now.text, was.color === now.color)));
  const going = s.was && s.way ? s.was : null;
  const out = s.way?.out ?? null;
  return (
    <View style={[styles.slot, slot]}>
      <InText key={`n${s.n}`} way={s.way?.in ?? null} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, { color: s.now.color }]}>
        {s.now.text}
      </InText>
      {going && out ? (
        <OutText key={`g${s.n}`} way={out} aria-hidden numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.over, { color: going.color }]}>
          {going.text}
        </OutText>
      ) : going ? (
        // Letters added: the old word held over the new one (so the letters both have stay solid) until the new ones are in.
        <Text key={`g${s.n}`} aria-hidden numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.over, { color: going.color }]}>
          {going.text}
        </Text>
      ) : null}
    </View>
  );
}

/** A word with more after it on its line: its width eases to the new word's (see the top of the file). */
export function GlideText({ text, style, maxFontSizeMultiplier }: { text: string; style: StyleProp<TextStyle>; maxFontSizeMultiplier?: number }) {
  const still = useReducedMotion();
  const s = useSwap<string>(text, (a, b) => a === b, () => SWAP);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  // Laid out as plain text in the line until its width is known, then held at that width (no remount between).
  const [sized, setSized] = useState(false);
  const box = useAnimatedStyle(() => (w.value > 0 ? { width: w.value, height: h.value } : {}));
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    h.value = height;
    if (!sized) { w.value = width; setSized(true); return; }
    // The line eases to the new word's width as the new word comes in, once the old one has gone.
    w.value = still ? width : withDelay(SWAP_HOLD_MS, withTiming(width, { duration: SWAP_MS - SWAP_HOLD_MS, easing: EASE }));
  };
  const out = s.was && s.way?.out ? s.way.out : null;
  // Once held at its width, a word is laid over the line at its own width with no cut (a one-line cut would
  // shorten it to the line's width, which a browser rounds to whole pixels: 'Hard' read 'Ha…'), and the line
  // clips only while it eases, so at rest nothing of the word is ever cut off.
  const one = sized ? undefined : 1;
  return (
    <Reanimated.View style={[box, s.way !== null && styles.clip]}>
      <InText key={`n${s.n}`} way={s.way?.in ?? null} numberOfLines={one} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, sized && styles.loose]}>{s.now}</InText>
      {out && s.was ? <OutText key={`g${s.n}`} way={out} aria-hidden maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.loose]}>{s.was}</OutText> : null}
      {/* The new word at its own width, unseen: what the line eases to. */}
      <View pointerEvents="none" style={styles.ruler}>
        <Text numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} onLayout={measure} style={[style, styles.measured]}>{s.now}</Text>
      </View>
    </Reanimated.View>
  );
}

/**
 * The avatar's disc when its colour changes (`token`): the new one grows in on top, the old one stays fully
 * drawn under it until it is covered, then goes; nothing fades out, so the disc never shows through lighter.
 */
export function SoftSwap({ token, children }: { token: string; children: React.ReactNode }) {
  // The children last drawn, kept under the new ones while they grow in.
  const drawn = useRef<React.ReactNode>(children);
  const kept = useRef<React.ReactNode>(null);
  const s = useSwap<string>(token, (a, b) => a === b, () => ({ in: 'grow', out: null }));
  const swapped = useRef(0);
  if (swapped.current !== s.n) { kept.current = drawn.current; swapped.current = s.n; }
  useLayoutEffect(() => { drawn.current = children; });
  return (
    <View>
      {s.was !== null && s.way ? <View key={`g${s.n}`} pointerEvents="none" style={styles.under}>{kept.current}</View> : null}
      <InView key={`n${s.n}`} way={s.way?.in ?? null}>{children}</InView>
    </View>
  );
}

/** The surface's small square, its colour easing to the new surface's. */
export function EaseSwatch({ color, style }: { color: string; style: StyleProp<ViewStyle> }) {
  const still = useReducedMotion();
  const c = useSharedValue(color);
  useEffect(() => {
    c.value = still ? color : withTiming(color, { duration: SOFT_MS, easing: EASE });
  }, [color, still, c]);
  const fill = useAnimatedStyle(() => ({ backgroundColor: c.value }));
  return <Reanimated.View style={[style, fill]} />;
}

/**
 * The rating, rolling to each new number as it is typed: from 0 the first time it becomes a real rating, after
 * that from the number on show (so a '.5' typed while 0 to 4 still counts carries on from where the count is,
 * never jumping to 4.0 first); the empty '–.–' gone before the first number shows. Its slot is as wide as the
 * system's widest number (UTR runs to 16.5), so nothing beside it moves as it rolls past 9.9 or fills.
 */
export function RollRating({ rated, value, wide, figure, empty, color, faint, maxFontSizeMultiplier }: {
  rated: boolean;
  value: number;
  /** Two figures before the point (UTR). */
  wide: boolean;
  figure: StyleProp<TextStyle>;
  /** The empty rating's own look (lighter). */
  empty: StyleProp<TextStyle>;
  color: string;
  faint: string;
  maxFontSizeMultiplier?: number;
}) {
  const still = useReducedMotion();
  // What the count shows: whether a change has rolled yet (a rating already there when the card is drawn shows
  // still), and which run it is: a rating cleared and typed again starts a new count from 0.
  const [roll, setRoll] = useState({ value, play: false, rated, run: 0, first: true });
  if (rated && (!roll.rated || roll.value !== value)) setRoll({ value, play: true, rated: true, run: roll.rated ? roll.run : roll.run + 1, first: !roll.rated });
  else if (!rated && roll.rated) setRoll({ ...roll, rated: false });
  const on = useSharedValue(rated ? 1 : 0);
  useEffect(() => {
    on.value = still ? (rated ? 1 : 0) : withTiming(rated ? 1 : 0, { duration: SOFT_MS, easing: EASE });
  }, [rated, still, on]);
  // One after the other, never both: the '–.–' clears in the first quarter of the change, the number shows after.
  const gone = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - on.value * 4) }));
  const shown = useAnimatedStyle(() => ({ opacity: Math.max(0, (on.value - 0.25) / 0.75) }));
  return (
    <View>
      {/* The slot: the widest number, unseen, so the rating's line and baseline are set by a real figure. */}
      <Text aria-hidden maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, styles.hidden]}>{wide ? '00.0' : '0.0'}</Text>
      <Reanimated.View style={[StyleSheet.absoluteFill, gone]}>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, empty, styles.right, { color: faint }]}>–.–</Text>
      </Reanimated.View>
      <Reanimated.View style={[StyleSheet.absoluteFill, shown]}>
        <CountUp key={roll.run} value={roll.value} from={0} resume part="dec1" play={roll.play} duration={roll.first ? 480 : SWAP_MS} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, styles.right, styles.fill, { color }]} />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignSelf: 'stretch', minWidth: 0 },
  // An old word over the new one, in the same place.
  over: { position: 'absolute', left: 0, right: 0, top: 0 },
  // The old disc under the new one growing in.
  under: { position: 'absolute', left: 0, top: 0 },
  clip: { overflow: 'hidden' },
  // Laid over the line at its own width, never cut short while the line eases.
  loose: { position: 'absolute', left: 0, top: 0, width: 600 },
  ruler: { position: 'absolute', left: 0, top: 0, width: 600, opacity: 0 },
  measured: { alignSelf: 'flex-start' },
  hidden: { opacity: 0 },
  right: { textAlign: 'right' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
