import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { DetectedActivity } from '@/data/types';
import { activityTitle, activityWhen } from '@/features/activity/format';
import { sourceWord } from '@/features/activity/recent';
import { formatDistance, isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import { duration } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** A row's top and bottom padding, and the height of its first line (the big number, and the button beside it). */
const ROW_PAD = 14;
const HERO_LINE = 32;

/** What a row shows of a workout: the same for one read from Health and one the server keeps. */
export type WorkoutRowItem = Pick<DetectedActivity, 'sport' | 'minutes' | 'distanceM' | 'source' | 'device' | 'startedAt' | 'endedAt'> & {
  /** Waiting to be logged, in your log already, or hidden ("Not tennis? Hide it"). */
  status: 'new' | 'logged' | 'hidden';
};

/**
 * One workout, as Past workouts lists them (and, since Oct 5, Workouts
 * found): how long first and big, with where it came from as a small tag,
 * then what it was and how far, then the day and the times. Log it (or
 * Logged, or Hidden) sits beside the big number.
 */
export function WorkoutRow({ w, line, busy, disabled, onLog }: { w: WorkoutRowItem; line: boolean; busy: boolean; disabled: boolean; onLog: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const tennis = isTennisActivity(w);
  const title = activityTitle(w);
  const far = tennis ? null : formatDistance(w.distanceM);
  const source = sourceWord(w);
  return (
    <View style={[styles.row, line && styles.line]}>
      <View style={styles.rowMain}>
        <View style={styles.icon}><Ionicons name={tennis ? 'stopwatch-outline' : workoutIcon(w.sport)} size={18} color={w.status === 'new' ? colors.court : colors.textMuted} /></View>
        <View style={styles.words}>
          <View style={styles.heroLine}>
            <Text style={styles.hero}>{duration(w.minutes)}</Text>
            <View style={styles.tag}><Text style={styles.tagText} numberOfLines={1}>{source}</Text></View>
          </View>
          <Text style={styles.title} numberOfLines={2}>{far ? `${title} · ${far}` : title}</Text>
          <Text style={styles.when}>{activityWhen(w, new Date(), ' · ')}</Text>
        </View>
      </View>
      <View style={styles.actionSpot}>
        {w.status === 'new' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Log it: ${title}, ${duration(w.minutes)}, ${activityWhen(w)}`} accessibilityState={{ busy, disabled }} disabled={disabled} hitSlop={8} onPress={onLog} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={styles.actionText}>Log it</Text>}
          </Pressable>
        ) : (
          <View style={styles.done} accessible accessibilityLabel={w.status === 'logged' ? 'Logged' : 'Hidden'}>
            {w.status === 'logged' ? <Ionicons name="checkmark" size={14} color={colors.textMuted} /> : null}
            <Text style={styles.doneText}>{w.status === 'logged' ? 'Logged' : 'Hidden'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** The card the rows sit in: the grouped list of Your sessions, a white card on a soft shadow, rows parted by a hairline. */
export function WorkoutCard({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={styles.group}>{children}</View>;
}

const styleDefinitions = StyleSheet.create({
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  row: { paddingVertical: ROW_PAD },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 22, height: HERO_LINE, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 3 },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: HERO_LINE, paddingRight: 96 },
  hero: { fontSize: 21, lineHeight: 26, ...font('600'), letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  tag: { flexShrink: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  tagText: { fontSize: 11, lineHeight: 15, ...font('600'), letterSpacing: 0.2, color: colors.textMuted },
  title: { fontSize: 15, lineHeight: 20, ...font('500'), color: colors.text },
  when: { fontSize: 14, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  actionSpot: { position: 'absolute', right: 0, top: ROW_PAD, height: HERO_LINE, justifyContent: 'center' },
  // Log it: the brand's filled pill, as on Your sessions' rows waiting to be logged.
  action: { minWidth: 72, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
  actionText: { ...typography.smallStrong, color: colors.brandInk },
  done: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 6 },
  doneText: { ...typography.smallStrong, color: colors.textMuted },
  pressed: { opacity: 0.6 },
});
