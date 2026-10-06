import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PersonalRecord, PracticeSession, Records, RecordKey, SessionTag, User } from '@/data/types';
import { dayWords } from '@/features/activity/format';
import { scoreText } from '@/features/activity/score';
import { peopleText, peopleWords } from '@/features/activity/sessionTags';
import { localDay } from '@/features/practice/stats';
import { weekRange } from '@/features/recap/recap';
import { RECORD_LABEL, recordValue } from '@/features/records/records';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography } from '@/theme';

/** A record set in the last week wears gold: the one to be proud of now. */
const FRESH_DAYS = 7;

/** "Sep 14 – 22", "Sep 28 – Oct 2". */
function dayRange(from: string, to: string): string {
  if (from === to) return dayWords(from);
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()} – ${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

/**
 * Personal records in Your sessions (owner, Oct 5: "personal records is
 * good"): your longest match, biggest win, most hours in a week, most
 * sessions in a month, and longest streak, each with when. Only you see it.
 * The newest record, when it was set in the last week, is drawn in gold. Shown from 3 sessions on
 * (YourSessions decides); a record with too little behind it yet (a week of
 * under an hour) waits, so a card is never a zero.
 *
 * Built to stand alone (the records and your log), so the Tennis profile can
 * show it later.
 */
export function PersonalRecords({ records, sessions, sessionTags, users, currentStreak, now = new Date() }: {
  records: Records;
  sessions: PracticeSession[];
  sessionTags: SessionTag[];
  users: User[];
  /** Today's streak, for "now on 3" beside the longest. */
  currentStreak: number;
  now?: Date;
}) {
  const styles = useThemedStyles(styleDefinitions);
  // Only the newest record wears gold, and only while it is a week old or less.
  const newest = Object.values(records).filter((r): r is PersonalRecord => !!r && r.to >= localDay(now.getTime() - FRESH_DAYS * 86_400_000))
    .sort((a, b) => b.to.localeCompare(a.to))[0];
  const fresh = (r: PersonalRecord) => r === newest;
  const sessionOf = (r: PersonalRecord) => (r.sessionId ? sessions.find((s) => s.id === r.sessionId) : undefined);
  const vs = (s: PracticeSession | undefined) => {
    if (!s) return '';
    const people = peopleWords(s, sessionTags, users);
    if (people?.vs.length) return peopleText({ ...people, with: [] }, false);
    return s.opponent ? `vs ${s.opponent.trim().split(/\s+/)[0]}` : '';
  };

  const tile = (key: RecordKey) => {
    const r = records[key];
    if (!r) return null;
    const s = sessionOf(r);
    const big = key === 'win' && s?.sets?.length ? scoreText(s.sets) : key === 'month' ? String(r.value) : recordValue(r);
    const small = key === 'match' ? [dayWords(r.from, now), vs(s)].filter(Boolean).join(' · ')
      : key === 'win' ? [recordValue(r), dayWords(r.from, now)].join(' · ')
        : key === 'week' ? weekRange(r.from)
          : key === 'month' ? new Date(`${r.from}T12:00:00`).toLocaleDateString(undefined, { month: 'long', ...(r.from.slice(0, 4) !== String(now.getFullYear()) ? { year: 'numeric' } : {}) })
            : '';
    const gold = fresh(r);
    return (
      <View key={key} style={[styles.tile, gold && { borderColor: colors.sun, borderWidth: 1.5 }]} accessible accessibilityLabel={`${RECORD_LABEL[key]}: ${big}${small ? `, ${small}` : ''}${gold ? '. New this week' : ''}`}>
        <View style={styles.tileHead}>
          {gold ? <Ionicons name="trophy" size={13} color={colors.sun} /> : null}
          <Text style={styles.tileLabel} numberOfLines={2}>{RECORD_LABEL[key]}</Text>
        </View>
        <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{big}</Text>
        {small ? <Text style={styles.tileSub} numberOfLines={1}>{small}</Text> : null}
      </View>
    );
  };

  const streak = records.streak;
  const shown = (['match', 'win', 'week', 'month'] as RecordKey[]).filter((k) => !!records[k]);
  if (!shown.length && !streak) return null;
  const ongoing = streak && streak.to >= localDay(now.getTime() - 86_400_000) && currentStreak >= streak.value;
  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Personal records</Text>
        <View style={styles.only}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
          <Text style={styles.onlyText}>Only you</Text>
        </View>
      </View>
      <View style={styles.grid}>{shown.map(tile)}</View>
      {streak ? (
        <View style={[styles.streak, styles.tileLike, fresh(streak) && { borderColor: colors.sun, borderWidth: 1.5 }]} accessible accessibilityLabel={`Longest streak: ${streak.value} days, ${dayRange(streak.from, streak.to)}${currentStreak && !ongoing ? `. Now on ${currentStreak}` : ''}`}>
          <Ionicons name="flame" size={16} color={colors.clay} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.tileLabel}>Longest streak</Text>
            <Text style={styles.tileSub}>{[dayRange(streak.from, streak.to), ongoing ? 'going now' : currentStreak ? `now on ${currentStreak}` : ''].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.streakValue}>{streak.value}<Text style={styles.streakUnit}> days</Text></Text>
        </View>
      ) : null}
    </View>
  );
}

/** The gold "Record" pill on a session that holds one, and "Best week" on a week's head. */
export function RecordPill({ label = 'Record' }: { label?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.pill, { backgroundColor: `${colors.sun}22` }]} accessible accessibilityLabel={label === 'Record' ? 'Personal record' : label}>
      <Ionicons name="trophy" size={10} color={colors.sun} />
      <Text style={[styles.pillText, { color: colors.sun }]}>{label}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  // The same as Your sessions' own section heads.
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, flex: 1 },
  only: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlyText: { ...typography.small, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { ...lift, flexGrow: 1, flexBasis: '45%', minWidth: 140, borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 4, borderWidth: 1.5, borderColor: 'transparent' },
  tileLike: { ...lift, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 18 },
  tileLabel: { ...typography.small, ...font('500'), color: colors.textMuted, flexShrink: 1 },
  tileValue: { ...font('600'), fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: colors.text, fontVariant: ['tabular-nums'] },
  tileSub: { ...typography.small, color: colors.textMuted },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 10, paddingHorizontal: 14, paddingVertical: 12 },
  streakValue: { ...font('600'), fontSize: 26, letterSpacing: -0.8, color: colors.text, fontVariant: ['tabular-nums'] },
  streakUnit: { ...font('500'), fontSize: 14, letterSpacing: 0, color: colors.textMuted },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, flexShrink: 0 },
  pillText: { fontSize: 11, lineHeight: 15, ...font('600'), letterSpacing: 0.2 },
});
