import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { activityTitle, activityWhen } from '@/features/activity/format';
import { PAST_DAYS, type PastWorkout } from '@/features/activity/pastWorkouts';
import { sourceWord } from '@/features/activity/recent';
import { formatDistance, isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import { appleHealthAvailable } from '@/features/health/appleHealth';
import { goBack } from '@/lib/goBack';
import { duration } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** A row's top and bottom padding, and the height of its first line (the big number, and the button beside it). */
const ROW_PAD = 14;
const HERO_LINE = 32;

/**
 * Past workouts (owner, Oct 5: "maybe even see his old ones"): the last 30
 * days, newest first, from Apple Health on this iPhone and from the server
 * (anything already picked up, from any tracker). Each says what it was, how
 * long and how far, when, and where it came from, with Log it on any not in
 * your log yet (it opens the same "Log it" page as a Workout detected alert),
 * or Logged, or Hidden. Only you see this page. Opened from Your sessions
 * and from the Health page.
 *
 * In a browser or on Android, Apple Health cannot be read, so the page shows
 * what the server already has and says where the rest is.
 */
export default function PastWorkouts() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, ready, remoteLoaded, currentUserId } = useApp();
  const [list, setList] = useState<PastWorkout[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const asking = useRef(0);

  const load = useCallback(async () => {
    const n = ++asking.current;
    const got = await actions.pastWorkouts().catch(() => null);
    if (n !== asking.current) return;
    if (got) { setList(got); setFailed(false); } else setFailed(true);
  }, [actions]);
  // Asked again each time the page comes back into view (one just logged says
  // Logged), and once your account has loaded, for a page opened cold.
  useFocusEffect(useCallback(() => { void load(); }, [load, ready, remoteLoaded, currentUserId]));

  const logIt = async (w: PastWorkout) => {
    if (busy) return;
    setBusy(w.key);
    try {
      const id = await actions.logPastWorkout(w);
      router.push({ pathname: '/compose', params: { activity: id } });
    } catch (e) {
      showToast({ title: 'Couldn’t open that workout', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' });
    } finally {
      setBusy(null);
    }
  };

  const healthHere = appleHealthAvailable();
  return (
    <Screen title="Past workouts" subtitle="Only you see this." compactTitle onBack={() => goBack('/your-sessions')} onRefresh={load}>
      {/* Over a list only: with nothing to list, the empty state says it once. */}
      {!healthHere && list?.length ? (
        <Text style={styles.note}>{Platform.OS === 'ios' ? 'Apple Health workouts show here in the App Store version of CourtSide.' : 'Apple Health workouts show here on your iPhone. These are the ones already picked up.'}</Text>
      ) : null}
      {list === null && !failed ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
      ) : list === null ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn’t load your workouts" body="Check your connection and try again." action={{ label: 'Try again', onPress: () => { setFailed(false); void load(); } }} />
      ) : !list.length ? (
        <EmptyState
          icon="fitness-outline"
          title={`No workouts in the last ${PAST_DAYS} days`}
          body={healthHere ? 'Start a workout on your Apple Watch or iPhone. It shows up here, and in Notifications, ready to log.' : 'Workouts from your Apple Watch or iPhone show here once CourtSide has them.'}
        />
      ) : (
        <View style={styles.group}>
          {list.map((w, i) => (
            <Row key={w.key} w={w} line={i > 0} busy={busy === w.key} disabled={!!busy} onLog={() => { void logIt(w); }} />
          ))}
        </View>
      )}
    </Screen>
  );
}

/**
 * One workout: how long first and big, with where it came from as a small
 * tag, then what it was and how far, then the day and the times. Log it
 * (or Logged, or Hidden) sits beside the big number.
 */
function Row({ w, line, busy, disabled, onLog }: { w: PastWorkout; line: boolean; busy: boolean; disabled: boolean; onLog: () => void }) {
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

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  wait: { paddingVertical: spacing.xxl, alignItems: 'center' },
  // The grouped list of Your sessions: a white card on a soft shadow, rows parted by a hairline.
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
