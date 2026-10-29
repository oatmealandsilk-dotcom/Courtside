import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CountUp } from '@/components/session/CountUp';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { LayerText, LayerView, SOFT_MS, layerIn, layerOut, type InWay, type OutWay } from './softLayer';

/*
 * The sign-up's live card in motion (ONBOARDING_V2, Oct 29, owner: "3-4 should maybe update the card when you
 * type or select something, it should be smooth and nice animations"). Each piece of the card that changes as
 * they type or tap changes softly, in its own fixed slot, so nothing beside it jumps:
 *
 * - SoftText: a word in a slot as wide as its line. Letters typed after the old ones fade in while the old ones
 *   stay put; letters taken away fade out; anything else (a town picked, a level, a hand) cross-dissolves, the
 *   new word rising 3pt into place as the old one fades.
 * - GlideText: a word with something after it on its line (the style before the surface swatch): the same
 *   cross-dissolve, its width easing to the new word's so what follows glides rather than jumps.
 * - SoftSwap: anything swapped whole (the avatar's initials and fill): the new one fades in growing a touch.
 * - EaseSwatch: the surface colour easing to the new one.
 * - RollRating: the rating counting to the new number, in a slot as wide as the system's widest.
 *
 * SOFT_MS (220ms), ease-out, nothing bouncy. Only words, a swatch and an avatar fade here: no glass or blur is
 * under any of them. With Reduce Motion (useReducedMotion, as the rest of the app) every change is instant.
 * The old layer stays in React only for its way out, then goes; at rest each piece is plain text.
 */

const EASE = Easing.out(Easing.cubic);
/** How long an old layer is kept after a change: its way out, and a frame or two to spare. */
const KEEP_MS = SOFT_MS + 40;

type Way = { in: InWay | null; out: OutWay | null };

/** How a word changes to the next: letters added fade in (the old ones held), letters taken away fade out, anything else cross-dissolves. */
function wayOf(was: string, now: string, sameInk: boolean): Way {
  if (sameInk && was && now.startsWith(was)) return { in: 'fade', out: null };
  if (sameInk && now && was.startsWith(now)) return { in: null, out: 'fade' };
  return { in: 'rise', out: 'quick' };
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
export function SoftText({ text, color, style, slot, maxFontSizeMultiplier }: {
  text: string;
  color: string;
  style: StyleProp<TextStyle>;
  /** The slot's own layout in its row (a town after the handle: flex 1). */
  slot?: StyleProp<ViewStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const s = useSwap<Ink>({ text, color }, sameInk, (was, now) => wayOf(was.text, now.text, was.color === now.color));
  const inn = layerIn(s.way?.in ?? null);
  const out = s.was && s.way ? (s.way.out ? layerOut(s.way.out) : null) : null;
  return (
    <View style={[styles.slot, slot]}>
      <LayerText key={`n${s.n}`} entering={inn.entering} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, { color: s.now.color }, inn.style]}>
        {s.now.text}
      </LayerText>
      {s.was && s.way ? (
        // Letters added: the old word held over the new one (so the letters both have stay solid) until the new ones are in.
        <LayerText key={`g${s.n}`} aria-hidden entering={out?.entering} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.over, { color: s.was.color }, out ? [styles.gone, out.style] : null]}>
          {s.was.text}
        </LayerText>
      ) : null}
    </View>
  );
}

/** A word with more after it on its line: its width eases to the new word's (see the top of the file). */
export function GlideText({ text, style, maxFontSizeMultiplier }: { text: string; style: StyleProp<TextStyle>; maxFontSizeMultiplier?: number }) {
  const still = useReducedMotion();
  const s = useSwap<string>(text, (a, b) => a === b, () => ({ in: 'rise', out: 'quick' }));
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  // Measured once as plain text first, so the line is laid out as before from its first frame.
  const [sized, setSized] = useState(false);
  const box = useAnimatedStyle(() => ({ width: w.value, height: h.value }));
  const first = (e: LayoutChangeEvent) => {
    w.value = e.nativeEvent.layout.width;
    h.value = e.nativeEvent.layout.height;
    setSized(true);
  };
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    h.value = height;
    w.value = still ? width : withTiming(width, { duration: SOFT_MS, easing: EASE });
  };
  if (!sized) {
    return <Text numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} onLayout={first} style={style}>{s.now}</Text>;
  }
  const inn = layerIn(s.way?.in ?? null);
  const out = s.was && s.way?.out ? layerOut(s.way.out) : null;
  return (
    <Reanimated.View style={[styles.glide, box]}>
      <LayerText key={`n${s.n}`} entering={inn.entering} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.loose, inn.style]}>{s.now}</LayerText>
      {out ? <LayerText key={`g${s.n}`} aria-hidden entering={out.entering} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.loose, styles.gone, out.style]}>{s.was}</LayerText> : null}
      {/* The new word at its own width, unseen: what the line eases to. */}
      <View pointerEvents="none" style={styles.ruler}>
        <Text numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} onLayout={measure} style={[style, styles.measured]}>{s.now}</Text>
      </View>
    </Reanimated.View>
  );
}

/** Something swapped whole when `token` changes (the avatar's initials and fill): see the top of the file. */
export function SoftSwap({ token, children }: { token: string; children: React.ReactNode }) {
  // The children last drawn, kept for their way out when the token changes.
  const drawn = useRef<React.ReactNode>(children);
  const kept = useRef<React.ReactNode>(null);
  const s = useSwap<string>(token, (a, b) => a === b, () => ({ in: 'grow', out: 'fade' }));
  const swapped = useRef(0);
  if (swapped.current !== s.n) { kept.current = drawn.current; swapped.current = s.n; }
  useLayoutEffect(() => { drawn.current = children; });
  const inn = layerIn(s.way?.in ?? null);
  const out = s.was !== null && s.way?.out ? layerOut(s.way.out) : null;
  return (
    <View>
      <LayerView key={`n${s.n}`} entering={inn.entering} style={inn.style}>{children}</LayerView>
      {out ? <LayerView key={`g${s.n}`} pointerEvents="none" entering={out.entering} style={[styles.over, styles.gone, out.style]}>{kept.current}</LayerView> : null}
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
 * The rating, rolling to each new number as it is typed: from 0 the first time it becomes a real rating, from
 * the last one after that; the empty '–.–' cross-dissolving with it. Its slot is as wide as the system's widest
 * number (UTR runs to 16.5), so nothing beside it moves as it rolls past 9.9 or fills.
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
  // What the count shows: where the last roll started, and whether a change has rolled yet (a rating already
  // there when the card is drawn shows still).
  const [roll, setRoll] = useState({ value, from: value, play: false, rated });
  if (rated && (!roll.rated || roll.value !== value)) setRoll({ value, from: roll.rated ? roll.value : 0, play: true, rated: true });
  else if (!rated && roll.rated) setRoll({ ...roll, rated: false });
  const on = useSharedValue(rated ? 1 : 0);
  useEffect(() => {
    on.value = still ? (rated ? 1 : 0) : withTiming(rated ? 1 : 0, { duration: SOFT_MS, easing: EASE });
  }, [rated, still, on]);
  const shown = useAnimatedStyle(() => ({ opacity: on.value }));
  // The empty '–.–' clears in the first part of the change, so it never reads as struck through the number rising under it.
  const gone = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - on.value * 2.5) }));
  return (
    <View>
      {/* The slot: the widest number, unseen, so the rating's line and baseline are set by a real figure. */}
      <Text aria-hidden maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, styles.hidden]}>{wide ? '00.0' : '0.0'}</Text>
      <Reanimated.View style={[StyleSheet.absoluteFill, gone]}>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, empty, styles.right, { color: faint }]}>–.–</Text>
      </Reanimated.View>
      <Reanimated.View style={[StyleSheet.absoluteFill, shown]}>
        <CountUp value={roll.value} from={roll.from} part="dec1" play={roll.play} duration={roll.from === 0 ? 480 : SOFT_MS + 40} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[figure, styles.right, styles.fill, { color }]} />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignSelf: 'stretch', minWidth: 0 },
  // An old word over the new one, in the same place.
  over: { position: 'absolute', left: 0, right: 0, top: 0 },
  // At rest out of sight: its way out takes it there from fully shown.
  gone: { opacity: 0 },
  glide: { overflow: 'hidden' },
  // Laid over the line at its own width, never cut short while the line eases.
  loose: { position: 'absolute', left: 0, top: 0, width: 600 },
  ruler: { position: 'absolute', left: 0, top: 0, width: 600, opacity: 0 },
  measured: { alignSelf: 'flex-start' },
  hidden: { opacity: 0 },
  right: { textAlign: 'right' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
