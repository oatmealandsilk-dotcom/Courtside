import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import { OpenRing } from '@/components/map/OpenRing';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { SessionCard } from '@/components/session/SessionCard';
import { StreakFlame } from '@/components/StreakFlame';
import type { SessionDetail } from '@/data/types';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, withAlpha } from '@/theme';

/**
 * The welcome's three moments of the app, drawn from the app's own pieces
 * (faces, the green open-to-hit ring, the session card, the streak flame)
 * with made-up people, so they are crisp at any size and follow the theme.
 * Each is laid out in one 320 × 400 box; the stage scales the box to fit.
 */
export const MOMENT_W = 320;
export const MOMENT_H = 400;

export const MOMENTS = [
  { headline: 'See who’s playing\nnear you.', spoken: 'A map of courts nearby, with players who are open to hit.' },
  { headline: 'Log every session.', spoken: 'A session card: 1 hour 24 minutes on court, with heart rate.' },
  { headline: 'Your tennis people,\nin one place.', spoken: 'A discussion with 14 answers, and friends on a streak.' },
] as const;

/** Made-up players for the pictures: never real accounts. */
const PEOPLE = {
  sam: { name: 'Sam Rivera', seed: 'welcome-sam' },
  maya: { name: 'Maya Chen', seed: 'welcome-maya' },
  leo: { name: 'Leo Park', seed: 'welcome-leo' },
  priya: { name: 'Priya Shah', seed: 'welcome-priya' },
  jonah: { name: 'Jonah Ellis', seed: 'welcome-jonah' },
  ana: { name: 'Ana Ruiz', seed: 'welcome-ana' },
};

export function Moment({ index }: { index: number }) {
  if (index === 1) return <SessionMoment />;
  if (index === 2) return <PeopleMoment />;
  return <MapMoment />;
}

/** Turns on a moment after a beat, so its ring draws or its numbers count while it is on screen. */
function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

// ---------------------------------------------------------------------------
// 1. The map: courts nearby, faces popping onto them, Sam open to hit.
// ---------------------------------------------------------------------------

const PINS = [
  { who: PEOPLE.maya, x: 62, y: 70, delay: 150 },
  { who: PEOPLE.leo, x: 226, y: 46, delay: 330 },
  { who: PEOPLE.sam, x: 196, y: 178, delay: 510, open: true },
  { who: PEOPLE.priya, x: 70, y: 214, delay: 690 },
];
const COURTS = [{ x: 140, y: 108 }, { x: 262, y: 132 }, { x: 34, y: 146 }];

function MapMoment() {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const ringOn = useAfter(700);
  const road = colors.surface;
  return (
    <View style={styles.map}>
      {/* The streets, a park and a river, in the page's own tones. */}
      <Svg width={MOMENT_W} height={MOMENT_H} style={StyleSheet.absoluteFill}>
        <Path d="M -20 300 C 60 270, 120 300, 190 262 S 300 230, 360 250" stroke={withAlpha(colors.hard, 0.16)} strokeWidth={26} fill="none" />
        <Rect x={150} y={-30} width={110} height={88} rx={18} fill={withAlpha(colors.grass, 0.2)} transform="rotate(12 205 14)" />
        <Rect x={-30} y={226} width={120} height={60} rx={16} fill={withAlpha(colors.grass, 0.16)} />
        <Path d="M -10 118 L 340 92" stroke={road} strokeWidth={11} />
        <Path d="M -10 236 L 340 214" stroke={road} strokeWidth={9} />
        <Path d="M 112 -10 L 150 390" stroke={road} strokeWidth={11} />
        <Path d="M 250 -10 L 286 390" stroke={road} strokeWidth={8} />
        <Path d="M -10 40 L 200 380" stroke={road} strokeWidth={5} />
        <Path d="M 40 -10 L 60 390" stroke={road} strokeWidth={4} />
      </Svg>
      {COURTS.map((c) => (
        <View key={`${c.x}-${c.y}`} style={[styles.court, { left: c.x - 13, top: c.y - 13 }]}>
          <CourtGlyph size={12} color={colors.court} />
        </View>
      ))}
      {/* You are here. */}
      <View style={[styles.youHalo, { left: 140 - 14, top: 244 - 14, backgroundColor: withAlpha(colors.info, 0.16) }]} />
      <View style={[styles.you, { left: 140 - 6, top: 244 - 6 }]} />
      {PINS.map((p) => (
        <Animated.View key={p.who.seed} entering={ZoomIn.delay(p.delay).springify().damping(13)} style={[styles.pin, { left: p.x - 22, top: p.y - 22 }]}>
          <OpenRing open={!!p.open && ringOn} size={36}>
            <Avatar name={p.who.name} seed={p.who.seed} size={36} />
          </OpenRing>
        </Animated.View>
      ))}
      <Animated.View entering={FadeInUp.delay(900).duration(450)} style={styles.chip}>
        <Avatar name={PEOPLE.sam.name} seed={PEOPLE.sam.seed} size={34} />
        <View style={styles.chipWords}>
          <Text style={styles.chipName} numberOfLines={1} maxFontSizeMultiplier={1.2}>Sam <Text style={styles.chipSoft}>· open to hit till 7pm</Text></Text>
          <View style={styles.chipMeta}>
            <View style={styles.openDot} />
            <Text style={styles.chipSoft} numberOfLines={1} maxFontSizeMultiplier={1.2}>Riverside Park · 0.4 mi</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. A session: the shirt-coloured card sliding up, its numbers counting.
// ---------------------------------------------------------------------------

const SESSION: SessionDetail = {
  focus: 'Practice',
  minutes: 84,
  drills: [],
  kind: 'practice',
  activityId: 'welcome-demo',
  maxHr: 171,
  avgHr: 138,
  zones: [9, 21, 28, 19, 7],
};

function SessionMoment() {
  const play = useAfter(260);
  return (
    <View style={stylesStatic.center}>
      <Animated.View entering={FadeInUp.duration(520).springify().damping(16)}>
        <SessionCard session={SESSION} width={300} aspect={300 / 372} play={play} people={[]} showSource={false} eyebrow="PRACTICE · TODAY" />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. Your people: a question with answers, friends on a streak.
// ---------------------------------------------------------------------------

const STREAKS = [
  { who: PEOPLE.maya, line: 'Hit 4 times this week', days: 12 },
  { who: PEOPLE.jonah, line: 'Match play at 6pm', days: 9 },
  { who: PEOPLE.ana, line: 'Serve practice', days: 5 },
];

function PeopleMoment() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.people}>
      <Animated.View entering={FadeInDown.duration(420)} style={styles.card}>
        <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>DISCUSSIONS</Text>
        <Text style={styles.question} maxFontSizeMultiplier={1.2}>What’s your go-to drill for a steadier backhand?</Text>
        <View style={styles.answers}>
          <View style={styles.faces}>
            {[PEOPLE.leo, PEOPLE.priya, PEOPLE.sam].map((p, i) => (
              <View key={p.seed} style={[styles.faceRim, i > 0 && { marginLeft: -8 }]}>
                <Avatar name={p.name} seed={p.seed} size={22} />
              </View>
            ))}
          </View>
          <Text style={styles.answersText} maxFontSizeMultiplier={1.2}>14 answers</Text>
          <View style={styles.coach}>
            <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
            <Text style={styles.coachText} maxFontSizeMultiplier={1.2}>A coach replied</Text>
          </View>
        </View>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(140).duration(420)} style={styles.card}>
        <Text style={styles.cardTitle} maxFontSizeMultiplier={1.2}>Friends on a streak</Text>
        {STREAKS.map((s, i) => (
          <Animated.View key={s.who.seed} entering={FadeIn.delay(300 + i * 160).duration(380)} style={styles.row}>
            <Avatar name={s.who.name} seed={s.who.seed} size={36} />
            <View style={styles.rowWords}>
              <Text style={styles.rowName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{s.who.name}</Text>
              <Text style={styles.rowLine} numberOfLines={1} maxFontSizeMultiplier={1.2}>{s.line}</Text>
            </View>
            <StreakFlame days={s.days} size="large" maxFontSizeMultiplier={1.2} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  center: { width: MOMENT_W, height: MOMENT_H, alignItems: 'center', justifyContent: 'center' },
});

const styleDefinitions = StyleSheet.create({
  // The map.
  map: { width: MOMENT_W, height: MOMENT_H, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  court: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(42, 36, 24, 0.12)' },
  you: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.info, borderWidth: 2, borderColor: colors.surface },
  youHalo: { position: 'absolute', width: 28, height: 28, borderRadius: 14 },
  pin: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: {
    position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.surface, boxShadow: '0px 8px 24px rgba(42, 36, 24, 0.12)',
  },
  chipWords: { flex: 1, gap: 3 },
  chipName: { ...font('600'), fontSize: 14, lineHeight: 18, color: colors.text },
  chipSoft: { ...font('400'), fontSize: 13, lineHeight: 17, color: colors.textMuted },
  chipMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.open },
  // Your people.
  people: { width: MOMENT_W, height: MOMENT_H, justifyContent: 'center', gap: 12 },
  card: { ...lift, borderRadius: 22, backgroundColor: colors.surface, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  eyebrow: { ...font('600'), fontSize: 11, letterSpacing: 0.9, color: colors.textFaint },
  question: { ...font('600'), fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: colors.text },
  answers: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faces: { flexDirection: 'row' },
  faceRim: { borderRadius: 13, borderWidth: 2, borderColor: colors.surface },
  answersText: { ...font('500'), fontSize: 13, color: colors.textMuted },
  coach: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  coachText: { ...font('600'), fontSize: 12, color: colors.brand },
  cardTitle: { ...font('600'), fontSize: 15, letterSpacing: -0.2, color: colors.text, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowWords: { flex: 1, gap: 1 },
  rowName: { ...font('600'), fontSize: 14, lineHeight: 18, color: colors.text },
  rowLine: { ...font('400'), fontSize: 13, lineHeight: 17, color: colors.textMuted },
});
