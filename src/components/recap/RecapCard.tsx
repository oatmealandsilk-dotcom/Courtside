import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import type { PracticeSession } from '@/data/types';
import { compareLine, weekRange, type WeekRecap } from '@/features/recap/recap';
import { RECORD_LABEL, recordValue } from '@/features/records/records';
import { duration } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "6h" and "15m" apart, so the hours can be big; "45" and "min" under an hour. */
function bigLength(minutes: number): [string, string] {
  if (minutes < 60) return [String(minutes), 'min'];
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [`${h}h`, m ? `${m}m` : ''];
}

/** "Wed – Sun", for a streak's days in the week. */
function weekdaySpan(from: string, to: string): string {
  const name = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  return from === to ? name(from) : `${name(from)} – ${name(to)}`;
}

/**
 * The weekly recap's card (owner, Oct 5): last week's time on court, big,
 * against the week before; a bar for each day; sessions, matches won and
 * lost, and the streak. The same card is the Instagram picture
 * (RecapStoryArt). Nothing on it but your own numbers.
 */
export function RecapCard({ recap, label = 'LAST WEEK' }: { recap: WeekRecap; label?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const [hours, minutes] = bigLength(recap.minutes);
  const compare = compareLine(recap);
  const most = Math.max(...recap.days, 1);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.mark}>
          <BrandMark size={16} color={colors.brand} />
          <Text style={styles.markText}>CourtSide</Text>
        </View>
      </View>
      <View style={styles.bigRow} accessible accessibilityLabel={`${recap.minutes} minutes on court`}>
        <Text style={styles.big}>{hours}</Text>
        {minutes ? <Text style={styles.bigSmall}>{minutes}</Text> : null}
      </View>
      <Text style={styles.onCourt}>on court</Text>
      {compare ? (
        <View style={styles.compare}>
          <Ionicons name={recap.minutes >= recap.prevMinutes ? 'arrow-up' : 'arrow-down'} size={14} color={colors.brand} />
          <Text style={styles.compareText}>{compare}</Text>
        </View>
      ) : null}
      <View style={styles.bars} accessible accessibilityLabel={`Each day: ${recap.days.map((m, i) => `${DAY_LETTERS[i]} ${m} minutes`).join(', ')}`}>
        {recap.days.map((m, i) => (
          <View key={i} style={styles.barCol}>
            <View style={styles.barSpace}>
              <View style={[styles.bar, m ? { height: `${Math.max(14, Math.round((m / most) * 100))}%`, backgroundColor: colors.brand } : styles.barNone]} />
            </View>
            <Text style={styles.barDay}>{DAY_LETTERS[i]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{recap.sessions}</Text>
          <Text style={styles.statLabel}>{recap.sessions === 1 ? 'session' : 'sessions'}</Text>
        </View>
        <View style={[styles.stat, styles.statLine]}>
          <Text style={styles.statValue}>{`${recap.won}–${recap.lost}`}</Text>
          <Text style={styles.statLabel}>matches</Text>
        </View>
        <View style={[styles.stat, styles.statLine]}>
          <Text style={styles.statValue}>{recap.streak}</Text>
          <Text style={styles.statLabel}>day streak</Text>
        </View>
      </View>
    </View>
  );
}

/** What stood out: "Best streak yet · 5 days in a row, Wed – Sun", "New record: longest match · 2h 40m vs Dev, Saturday". */
export function RecapHighlights({ recap, sessions }: { recap: WeekRecap; sessions: PracticeSession[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const rows: { key: string; icon: 'flame' | 'trophy' | 'stats-chart'; tint: string; title: string; line: string }[] = [];
  if (recap.bestWeek) rows.push({ key: 'week', icon: 'stats-chart', tint: colors.brand, title: 'Your biggest week yet', line: `${duration(recap.minutes)} on court, more than any week before` });
  if (recap.bestStreak && recap.streakFrom && recap.streakTo) {
    const inWeek = recap.streakFrom < recap.week ? recap.week : recap.streakFrom;
    rows.push({ key: 'streak', icon: 'flame', tint: colors.clay, title: 'Best streak yet', line: `${recap.streak} days in a row, ${weekdaySpan(inWeek, recap.streakTo)}` });
  }
  for (const b of recap.records) {
    if (b.key === 'streak' || b.key === 'week') continue;
    const s = b.now.sessionId ? sessions.find((x) => x.id === b.now.sessionId) : undefined;
    rows.push({
      key: `rec-${b.key}`, icon: 'trophy', tint: colors.sun,
      title: `New record: ${RECORD_LABEL[b.key].charAt(0).toLowerCase()}${RECORD_LABEL[b.key].slice(1)}`,
      line: `${recordValue(b.now)}${s?.opponent ? ` vs ${s.opponent.split(/\s+/)[0]}` : ''}${s ? `, ${new Date(`${s.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}` : ''}`,
    });
  }
  if (!rows.length) return null;
  return (
    <View style={styles.highlights}>
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.highlight, i > 0 && styles.highlightLine]} accessible accessibilityLabel={`${r.title}. ${r.line}`}>
          <View style={[styles.highlightDisc, { backgroundColor: `${r.tint}26` }]}><Ionicons name={r.icon} size={17} color={r.tint} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.highlightTitle}>{r.title}</Text>
            <Text style={styles.highlightLine2}>{r.line}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * "Your week" at the top of Your sessions, Monday to Wednesday (the in-app
 * recap, for anyone without the alert): the week's bars small, its hours and
 * sessions, and how it compares. A tap opens the whole card; × puts it away
 * for that week.
 */
export function YourWeekBanner({ recap, onOpen, onClose }: { recap: WeekRecap; onOpen: () => void; onClose?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const most = Math.max(...recap.days, 1);
  const compare = compareLine(recap);
  const quiet = !recap.sessions;
  return (
    <View style={styles.banner}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Your week, ${weekRange(recap.week)}: ${recap.line ?? ''} Open`} onPress={onOpen} style={({ pressed }) => [styles.bannerMain, pressed && styles.pressed]}>
        <View style={styles.mini}>
          {recap.days.map((m, i) => (
            <View key={i} style={[styles.miniBar, m ? { height: Math.max(6, Math.round((m / most) * 34)), backgroundColor: colors.brand } : styles.miniNone]} />
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.bannerLabel} numberOfLines={1}>{`YOUR WEEK · ${weekRange(recap.week).toUpperCase()}`}</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{quiet ? 'A quiet week' : `${bigLength(recap.minutes).join(' ').trim()} on court · ${recap.sessions} ${recap.sessions === 1 ? 'session' : 'sessions'}`}</Text>
          <Text style={styles.bannerLine} numberOfLines={1}>{quiet ? 'Up for a hit this week?' : compare ?? (recap.bestStreak ? 'Best streak yet' : 'Your first week here')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Hide this week's recap" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.bannerClose, pressed && styles.pressed]}>
          <Ionicons name="close" size={14} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.7 },
  card: { ...lift, borderRadius: 24, backgroundColor: colors.surface, padding: spacing.xl, paddingBottom: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.caption, fontSize: 12, letterSpacing: 1.4, color: colors.brand },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markText: { ...font('600'), fontSize: 13, color: colors.brand },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.sm },
  big: { ...font('600'), fontSize: 64, lineHeight: 70, letterSpacing: -2.5, color: colors.text, fontVariant: ['tabular-nums'] },
  bigSmall: { ...font('600'), fontSize: 30, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  onCourt: { ...typography.body, color: colors.textMuted, marginTop: -2 },
  compare: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  compareText: { ...font('600'), fontSize: 13.5, color: colors.brand },
  bars: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, height: 130, marginTop: spacing.xl },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barSpace: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 8 },
  barNone: { height: 6, backgroundColor: colors.surfaceAlt },
  barDay: { ...font('500'), fontSize: 12, color: colors.textMuted },
  stats: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stat: { flex: 1, gap: 2 },
  statLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: spacing.md },
  statValue: { ...font('600'), fontSize: 24, letterSpacing: -0.7, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.small, color: colors.textMuted },
  highlights: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  highlightLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  highlightDisc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  highlightTitle: { ...font('600'), fontSize: 15, color: colors.text },
  highlightLine2: { ...typography.small, color: colors.textMuted },
  banner: { ...lift, borderRadius: 20, backgroundColor: colors.surface, marginTop: spacing.sm, overflow: 'hidden' },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14, paddingRight: 34 },
  bannerClose: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  mini: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 34, width: 52 },
  miniBar: { flex: 1, borderRadius: 2 },
  miniNone: { height: 3, backgroundColor: colors.surfaceAlt },
  bannerLabel: { ...typography.caption, fontSize: 10.5, letterSpacing: 1, color: colors.brand },
  bannerTitle: { ...font('600'), fontSize: 15.5, letterSpacing: -0.2, color: colors.text },
  bannerLine: { ...typography.small, color: colors.textMuted },
});
