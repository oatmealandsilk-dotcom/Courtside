import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Tappable } from '@/components/Tappable';
import type { ID, SessionDetail } from '@/data/types';
import { pillPieces, resultWord, spokenDuration } from '@/features/activity/format';
import { localDay } from '@/features/practice/stats';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { BrandWash } from '@/components/ui';
import { colors, font, pageIsDark } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { ZoneGlyph } from './ZoneGlyph';

/** Small words over video wear a crisp dark edge (see ReelCaption); white over media is the one exception to the theme's colours. */
const EDGE_SMALL = { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.25 } as const;
const NUDGE_KEY = 'courtside-stats-pill-nudge';
/** Whether the chevron has already said hello today, on this phone. */
let nudgedOn: string | null = null;

/**
 * A clip's session, on one glass pill over the video, under its words:
 * the time, the result (or what it was), heart rate when shared (or the
 * first player when it is not), then "See stats". As room runs out, the
 * heart rate (or player) goes first, then the result; "See stats" never.
 * One tap raises the stats, the clip still playing above them.
 */
export function StatsPill({ session, hidden = [], onPress, scale = 1, active = false }: {
  session: SessionDetail;
  hidden?: ID[];
  onPress?: () => void;
  /** Smaller, for the composer's preview. */
  scale?: number;
  /** The clip is the page on show: once a day the chevron nudges. */
  active?: boolean;
}) {
  const k = scale;
  useTheme(); // repaint when the theme changes
  const isDark = pageIsDark();
  const p = pillPieces(session, hidden);
  const result = resultWord(session);
  const spoken = `Session stats: ${[spokenDuration(session.minutes), result?.toLowerCase(), session.maxHr ? `max heart rate ${session.maxHr}` : p.third].filter(Boolean).join(', ')}`;
  // The room there is, so pieces drop out whole rather than being cut: heart
  // rate (or the player) first, then the result. The time and "See stats" stay.
  // Each version (all pieces, without the last, without both) is laid out
  // once out of sight; the longest that fits the room is the one shown.
  const [room, setRoom] = useState(0);
  const all = [p.result, p.third].filter((x): x is string => !!x);
  const versions = all.map((_, i) => all.slice(0, all.length - i).join(' · ')).concat('');
  const [widths, setWidths] = useState<Record<number, number>>({});
  const fits = versions.findIndex((_, i) => widths[i] !== undefined && widths[i] <= room);
  const rest = room > 0 && fits >= 0 ? versions[fits] : versions[0];
  const reduced = useReducedMotion();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced || scale !== 1) return undefined;
    const today = localDay(new Date());
    if (nudgedOn === today) return undefined;
    let live = true;
    const t = setTimeout(() => {
      void AsyncStorage.getItem(NUDGE_KEY).catch(() => null).then((was) => {
        if (!live || was === today || nudgedOn === today) return;
        nudgedOn = today;
        void AsyncStorage.setItem(NUDGE_KEY, today).catch(() => undefined);
        const up = withTiming(-3, { duration: 300, easing: Easing.inOut(Easing.quad) });
        const down = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) });
        lift.value = withDelay(0, withSequence(up, down, withTiming(-3, { duration: 300, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) })));
      });
    }, 1200);
    return () => { live = false; clearTimeout(t); };
  }, [active, reduced, scale, lift]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  const text = { ...font('600'), fontSize: 13.5 * k, color: '#FFFFFF', fontVariant: ['tabular-nums' as const], ...EDGE_SMALL };
  const row = (words: string, still = false) => (
    <View style={[styles.row, { height: 32 * k, paddingLeft: 10 * k, paddingRight: 5 * k, gap: 8 * k }]}>
      <ZoneGlyph size={14 * k} color="#FFFFFF" />
      {/* The time and the rest sit together with no gap between them, so the
          first dot has the same space either side as the others ("1h 24m · Won · 171 bpm"). */}
      <View style={[styles.row, still ? styles.keep : styles.shrink]}>
        <Text style={[text, font('700'), styles.keep]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{p.time}</Text>
        {words ? <Text style={[text, still ? styles.keep : styles.shrink]} numberOfLines={1} ellipsizeMode="clip" maxFontSizeMultiplier={1.2}>{`\u00A0· ${words}`}</Text> : null}
      </View>
      <View style={[styles.divider, { height: 14 * k }]} />
      <Text style={[text, styles.keep, { fontSize: 13 * k }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>See stats</Text>
      {still ? <Ionicons name="chevron-up" size={11 * k} color="#FFFFFF" /> : <Reanimated.View style={chevron}><Ionicons name="chevron-up" size={11 * k} color="#FFFFFF" style={EDGE_SMALL} /></Reanimated.View>}
    </View>
  );
  const inner = row(rest);
  // The versions, measured where nobody sees or reaches them.
  const rulers = versions.length > 1 ? (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rulers}>
      {versions.map((v, i) => (
        <View key={v || '-'} style={styles.ruler} onLayout={(e) => { const w = Math.ceil(e.nativeEvent.layout.width + StyleSheet.hairlineWidth * 2); setWidths((was) => (was[i] === w ? was : { ...was, [i]: w })); }}>
          {row(v, true)}
        </View>
      ))}
    </View>
  ) : null;
  const shell = [styles.pill, { borderRadius: 16 * k }];
  // The workout card's own colour (Oct 3): the theme's brand with the same wash,
  // so a clip's stats read as the same thing as a stats post. Dark themes keep the glass.
  const glass = !isDark
    ? <View style={[shell, styles.brandFill, { backgroundColor: colors.brand }]}><BrandWash radius={16 * k} />{inner}</View>
    : Platform.OS === 'ios'
      ? <BlurView intensity={30} tint="dark" style={[shell, styles.iosFill]}>{inner}</BlurView>
      : <View style={[shell, styles.flatFill]}>{inner}</View>;
  const measure = (node: React.ReactNode) => (
    <View style={styles.room} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w !== room) setRoom(w); }}>{rulers}{node}</View>
  );
  if (!onPress) return measure(<View accessible accessibilityLabel={spoken} style={styles.self}>{glass}</View>);
  return measure(
    <Tappable
      onPress={() => { haptics.tap(); onPress(); }}
      scaleTo={0.96}
      hitSlop={8}
      accessibilityLabel={`${spoken}. Opens the stats.`}
      style={styles.self}
    >
      {glass}
    </Tappable>,
  );
}

const styles = StyleSheet.create({
  room: { width: '100%' },
  rulers: { position: 'absolute', left: 0, right: 0, top: 0, height: 0, opacity: 0, overflow: 'hidden' },
  ruler: { position: 'absolute', left: 0, top: 0, flexDirection: 'row' },
  self: { alignSelf: 'flex-start', maxWidth: '100%' },
  keep: { flexShrink: 0 },
  pill: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.28)' },
  iosFill: { backgroundColor: 'rgba(18, 22, 20, 0.34)' },
  flatFill: { backgroundColor: 'rgba(18, 22, 20, 0.46)' },
  brandFill: { borderColor: 'rgba(255, 255, 255, 0.22)' },
  row: { flexDirection: 'row', alignItems: 'center' },
  shrink: { flexShrink: 1, minWidth: 0 },
  divider: { width: 1, backgroundColor: 'rgba(255, 255, 255, 0.35)' },
});
