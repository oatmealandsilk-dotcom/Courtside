import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { tick } from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

/**
 * A birthday picked on a wheel, like the phone's own date picker (Oct 17,
 * owner: "Make the UI of the what's your birthday ... a lot better"). Three
 * columns, month, day and year, each one dragged or flicked and settling on
 * a row in the band across the middle, with a click per row on a phone.
 * Built here rather than taken from a package: the app updates over the air,
 * so it cannot add the phone's own picker. Each column is a slider to
 * VoiceOver (swipe up or down to change it); on the website a mouse wheel,
 * a drag, a click on a row and the arrow keys all move it.
 *
 * Each column starts on a faint "Month", "Day" or "Year" row, so no date is
 * shown until the person picks one, and Continue waits for all three (Oct 17
 * review: a wheel that opened on a date 20 years ago, ready after one flick,
 * was a grown-up's birthday filled in for them).
 */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const daysIn = (month: number, year: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Month 0–11, day 1–31, full year; null until that column has been picked. */
export type WheelDate = { month: number | null; day: number | null; year: number | null };

export const EMPTY_WHEEL: WheelDate = { month: null, day: null, year: null };

export function DateWheel({ value, onChange, rowHeight = 40, label = 'Birthday', plain = false }: {
  value: WheelDate;
  onChange: (next: WheelDate) => void;
  rowHeight?: number;
  label?: string;
  /**
   * On the page like the iPhone's own picker (the sign-up redraw, ONBOARDING_V2): no card round
   * it, a neutral grey band, lighter figures, and the fades in the page's colour.
   */
  plain?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const thisYear = new Date().getFullYear();
  // Row 0 of each column is its name, faint: nothing picked yet.
  const months = useMemo(() => ['Month', ...MONTHS], []);
  // Newest year first, under "Year".
  const years = useMemo(() => {
    const list: string[] = ['Year'];
    for (let y = thisYear; y >= Math.max(1900, thisYear - 100); y -= 1) list.push(String(y));
    return list;
  }, [thisYear]);
  // No month yet: 31 days. No year yet: a leap year, so 29 February can be picked first.
  const dayCount = value.month === null ? 31 : daysIn(value.month, value.year ?? 2000);
  const days = useMemo(() => ['Day', ...Array.from({ length: dayCount }, (_, i) => String(i + 1))], [dayCount]);
  // A month or year with fewer days pulls the day back in (31 March → February: the 28th or 29th).
  useEffect(() => { if (value.day !== null && value.day > dayCount) onChange({ ...value, day: dayCount }); }, [dayCount, value, onChange]);

  const height = rowHeight * 5;
  const dark = pageIsDark();
  const band = withAlpha(colors.brand, dark ? 0.2 : 0.09);
  return (
    <View style={[styles.wheel, plain && styles.wheelPlain, { height }]} accessibilityRole="none" aria-label={label}>
      <View pointerEvents="none" style={[styles.band, plain && styles.bandPlain, { top: rowHeight * 2, height: rowHeight }, !plain && { backgroundColor: band }]} />
      <Column flex={1.55} align="left" label="Month" items={months} index={value.month === null ? 0 : value.month + 1} rowHeight={rowHeight} plain={plain}
        onIndex={(i) => onChange({ ...value, month: i === 0 ? null : i - 1 })} />
      <Column flex={0.75} align="center" label="Day" items={days} index={value.day === null ? 0 : Math.min(value.day, dayCount)} rowHeight={rowHeight} plain={plain}
        onIndex={(i) => onChange({ ...value, day: i === 0 ? null : i })} />
      <Column flex={1} align="right" label="Year" items={years} index={value.year === null ? 0 : thisYear - value.year + 1} rowHeight={rowHeight} plain={plain}
        onIndex={(i) => onChange({ ...value, year: i === 0 ? null : thisYear - i + 1 })} />
      {/* The soft fade at the top and bottom, in the card's own colour (plain: the page's). */}
      <Fade height={rowHeight * 1.8} top plain={plain} />
      <Fade height={rowHeight * 1.8} plain={plain} />
    </View>
  );
}

function Fade({ height, top, plain }: { height: number; top?: boolean; plain?: boolean }) {
  const id = `${top ? 'wheelFadeTop' : 'wheelFadeBottom'}${plain ? 'Plain' : ''}`;
  const into = plain ? colors.bg : colors.surface;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, top ? { bottom: undefined } : { top: undefined }, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
            <Stop offset="0" stopColor={into} stopOpacity={0.95} />
            <Stop offset="1" stopColor={into} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** How many rows either side of the middle are drawn; the rest are off the wheel. */
const REACH = 5;

function Column({ items, index, onIndex, label, rowHeight, flex, align, plain }: {
  items: string[]; index: number; onIndex: (i: number) => void;
  label: string; rowHeight: number; flex: number; align: 'left' | 'center' | 'right'; plain?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const last = items.length - 1;
  const pos = useSharedValue(index * rowHeight);
  const start = useSharedValue(0);
  const [near, setNear] = useState(index);
  const [focused, setFocused] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const lastRef = useRef(last);
  lastRef.current = last;

  // Told from outside (the day pulled in for a shorter month): roll there.
  useEffect(() => {
    if (Math.round(pos.value / rowHeight) !== index) pos.value = withTiming(index * rowHeight, { duration: 240, easing: Easing.out(Easing.cubic) });
    setNear(index);
  }, [index, rowHeight, pos]);

  // Only a row that really changed counts: a touch that moves nothing picks nothing.
  const commit = useCallback((i: number) => { if (i !== indexRef.current) { indexRef.current = i; onIndex(i); } }, [onIndex]);

  /** Moves by whole rows (keys, mouse wheel, VoiceOver). */
  const step = useCallback((by: number, to?: number) => {
    const target = Math.max(0, Math.min(lastRef.current, to ?? indexRef.current + by));
    pos.value = withTiming(target * rowHeight, { duration: 200, easing: Easing.out(Easing.cubic) });
    commit(target);
  }, [commit, pos, rowHeight]);

  // A click per row passed, and the rows drawn follow the wheel.
  useAnimatedReaction(() => Math.round(pos.value / rowHeight), (now, before) => {
    if (before === null || now === before) return;
    runOnJS(setNear)(now);
    if (now >= 0 && now <= last) runOnJS(tick)();
  }, [rowHeight, last]);

  const settle = (target: number) => {
    'worklet';
    const distance = Math.abs(target * rowHeight - pos.value) / rowHeight;
    pos.value = withTiming(target * rowHeight, { duration: Math.min(900, 260 + distance * 28), easing: Easing.out(Easing.cubic) });
    runOnJS(commit)(target);
  };
  const max = last * rowHeight;
  const pan = Gesture.Pan()
    .onBegin(() => { cancelAnimation(pos); start.value = pos.value; })
    .onUpdate((e) => {
      const next = start.value - e.translationY;
      // Past either end it gives a little, like the phone's own wheel.
      pos.value = next < 0 ? next / 3 : next > max ? max + (next - max) / 3 : next;
    })
    .onEnd((e) => {
      const projected = pos.value - e.velocityY * 0.2;
      settle(Math.max(0, Math.min(last, Math.round(projected / rowHeight))));
    })
    .onFinalize(() => {
      // A finger that stopped a spinning wheel and let go without dragging: it still lands on a row.
      const row = Math.round(pos.value / rowHeight);
      if (Math.abs(pos.value - row * rowHeight) > 0.5) settle(Math.max(0, Math.min(last, row)));
    });
  const tap = Gesture.Tap().maxDuration(400).onEnd((e) => {
    const rows = Math.round((e.y - rowHeight * 2.5) / rowHeight);
    settle(Math.max(0, Math.min(last, Math.round(pos.value / rowHeight) + rows)));
  });
  const gesture = Gesture.Exclusive(pan, tap);

  // The website: the mouse wheel and the keys.
  const node = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = node.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    let pending = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pending += e.deltaMode === 1 ? e.deltaY * rowHeight : e.deltaY;
      const rows = Math.trunc(pending / (rowHeight * 0.75) + 1e-6);
      if (rows) { pending -= rows * rowHeight * 0.75; step(rows); }
    };
    const onKey = (e: KeyboardEvent) => {
      const moves: Record<string, () => void> = {
        ArrowUp: () => step(-1), ArrowDown: () => step(1), PageUp: () => step(-5), PageDown: () => step(5),
        Home: () => step(0, 0), End: () => step(0, lastRef.current),
      };
      const move = moves[e.key];
      if (move) { e.preventDefault(); move(); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('keydown', onKey); };
  }, [rowHeight, step]);

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') step(1);
    if (e.nativeEvent.actionName === 'decrement') step(-1);
  };

  const from = Math.max(0, near - REACH);
  const to = Math.min(last, near + REACH);
  const shown: number[] = [];
  for (let i = from; i <= to; i += 1) shown.push(i);
  const rail = useAnimatedStyle(() => ({ transform: [{ translateY: rowHeight * 2 - pos.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={node}
        style={[styles.column, { flex }, focused && styles.columnFocused]}
        accessible
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: index === 0 ? 'Not picked' : items[index] ?? '' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        aria-valuetext={index === 0 ? 'Not picked' : items[index] ?? ''}
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={last}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <Animated.View style={[StyleSheet.absoluteFill, rail]}>
          {shown.map((i) => (
            <Row key={i} i={i} text={items[i]} pos={pos} rowHeight={rowHeight} align={align} plain={plain} />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function Row({ i, text, pos, rowHeight, align, plain }: { i: number; text: string; pos: SharedValue<number>; rowHeight: number; align: 'left' | 'center' | 'right'; plain?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const look = useAnimatedStyle(() => {
    const d = (i * rowHeight - pos.value) / rowHeight;
    const far = Math.min(Math.abs(d), 3);
    return {
      opacity: 1 - far * 0.3,
      transform: [{ perspective: 600 }, { rotateX: `${Math.max(-60, Math.min(60, -d * 19))}deg` }, { scale: 1 - far * 0.04 }],
    };
  });
  return (
    <Animated.View style={[styles.row, { top: i * rowHeight, height: rowHeight }, look]}>
      <Text numberOfLines={1} style={[styles.rowText, plain && styles.rowTextPlain, i === 0 && styles.rowPlaceholder, { textAlign: align }]}>{text}</Text>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  wheel: {
    flexDirection: 'row', overflow: 'hidden', borderRadius: radius.xl,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  // Plain: on the page itself, no card (the wheel's own padding keeps the figures in from the band's ends).
  wheelPlain: { borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: spacing.sm },
  band: { position: 'absolute', left: spacing.sm, right: spacing.sm, borderRadius: radius.md },
  bandPlain: { left: 0, right: 0, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  column: { overflow: 'hidden', borderRadius: radius.md, ...(Platform.OS === 'web' ? { cursor: 'grab', outlineStyle: 'none' } : null) } as object,
  columnFocused: Platform.OS === 'web' ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: -2 } as object : {},
  row: { position: 'absolute', left: spacing.sm, right: spacing.sm, justifyContent: 'center' },
  rowText: { ...typography.title, fontSize: 21, color: colors.text, fontVariant: ['tabular-nums'] },
  rowTextPlain: { ...font('400') },
  rowPlaceholder: { color: colors.textFaint },
});
