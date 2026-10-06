import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { WorkoutCard, WorkoutRow } from '@/components/WorkoutRow';
import { PAST_DAYS, type PastWorkout } from '@/features/activity/pastWorkouts';
import { appleHealthAvailable } from '@/features/health/appleHealth';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

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
        <WorkoutCard>
          {list.map((w, i) => (
            <WorkoutRow key={w.key} w={w} line={i > 0} busy={busy === w.key} disabled={!!busy} onLog={() => { void logIt(w); }} />
          ))}
        </WorkoutCard>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  wait: { paddingVertical: spacing.xxl, alignItems: 'center' },
});
