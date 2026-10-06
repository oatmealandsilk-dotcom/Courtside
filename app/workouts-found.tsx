import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { WorkoutCard, WorkoutRow, type WorkoutRowItem } from '@/components/WorkoutRow';
import type { DetectedActivity, ID } from '@/data/types';
import { allTennis, foundTitle } from '@/features/activity/found';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/** Without a list (the lock-screen alert's tap), those waiting that were found in the last eight days: the server's catch-up window. */
const WAITING_DAYS = 8;

/**
 * Workouts found (owner, Oct 5: grouped notifications): what one "4 workouts
 * found" row in Notifications, or one such alert on the lock screen, stands
 * for, as a list, newest first, each with its own Log it (the same page as
 * a single "Activity detected" row's tap: post it, or just log it). Logged
 * ones say Logged, hidden ones Hidden, as on Past workouts, whose rows these
 * are. Only you see this page.
 *
 * `ids`: the workouts of that one row (features/activity/found). Without
 * them (the alert's tap), every workout still waiting to be logged that was
 * found in the last eight days. Opening it marks their rows in
 * Notifications read, together.
 */
export default function WorkoutsFound() {
  const styles = useThemedStyles(styleDefinitions);
  const { ids: idsParam } = useLocalSearchParams<{ ids?: string }>();
  const { detectedActivities, currentUserId, ready, actions } = useApp();
  const asked = useMemo(() => (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200), [idsParam]);

  // A session the app no longer holds (older than the two weeks it keeps): read on its own, while the server keeps it.
  const [extra, setExtra] = useState<Record<ID, DetectedActivity | null>>({});
  const missing = useMemo(() => asked.filter((id) => !detectedActivities.some((a) => a.id === id) && !(id in extra)), [asked, detectedActivities, extra]);
  useEffect(() => {
    if (!ready || !missing.length) return undefined;
    let on = true;
    void Promise.all(missing.map((id) => actions.fetchActivity(id).catch(() => null))).then((got) => {
      if (on) setExtra((e) => ({ ...e, ...Object.fromEntries(missing.map((id, i) => [id, got[i]])) }));
    });
    return () => { on = false; };
  }, [ready, missing, actions]);

  // Opened from the lock screen: what the server filed since the app last read it.
  const fetched = useRef(false);
  useEffect(() => {
    if (!ready || fetched.current) return;
    fetched.current = true;
    void actions.refreshActivities();
  }, [ready, actions]);

  const list = useMemo(() => {
    const mine = (a: DetectedActivity | null | undefined): a is DetectedActivity => !!a && a.userId === currentUserId && a.status !== 'withdrawn' && a.status !== 'duplicate';
    const held = (id: ID) => detectedActivities.find((a) => a.id === id) ?? extra[id];
    // The same session from WHOOP and the Watch: the one that carries it, once.
    const one = (a: DetectedActivity | null | undefined) => (a?.status === 'duplicate' && a.duplicateOf ? held(a.duplicateOf) ?? a : a);
    const picked = asked.length
      ? asked.map((id) => one(held(id))).filter(mine).filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i)
      : detectedActivities.filter((a) => mine(a) && a.status === 'new' && Date.parse(a.createdAt) > Date.now() - WAITING_DAYS * 86_400_000);
    return [...picked].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }, [asked, detectedActivities, extra, currentUserId]);
  const waitingFor = asked.length > 0 && missing.length > 0 && list.length < asked.length;

  // Their rows in Notifications, read together (the bell's number drops by one).
  // (Those asked for too: a row about a copy that turned out to be the same session as another.)
  const listIds = [...new Set([...asked, ...list.map((a) => a.id)])].join(',');
  useEffect(() => {
    if (listIds) actions.markActivityNotesRead(listIds.split(','));
  }, [listIds, actions]);

  const row = (a: DetectedActivity): WorkoutRowItem => ({ ...a, status: a.status === 'logged' ? 'logged' : a.status === 'dismissed' ? 'hidden' : 'new' });
  const waiting = list.filter((a) => a.status === 'new').length;
  const title = list.length > 1 ? foundTitle(list.length, allTennis(list.map((a) => a.id), [], list)) : 'Workouts found';
  const subtitle = !list.length ? 'Only you see this.' : waiting ? `${waiting} to log · only you see this` : 'All logged · only you see this';

  return (
    <Screen title={title} subtitle={subtitle} compactTitle onBack={() => goBack('/notifications')}>
      {list.length === 0 && (waitingFor || !ready) ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
      ) : list.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing waiting to log"
          body="Every workout found is logged or hidden."
          action={{ label: 'Past workouts', onPress: () => router.push('/workouts') }}
        />
      ) : (
        <>
          <Text style={styles.note}>Newest first. Log the ones you want; the rest wait in Past workouts.</Text>
          <WorkoutCard>
            {list.map((a, i) => (
              <WorkoutRow
                key={a.id}
                w={row(a)}
                line={i > 0}
                busy={false}
                disabled={false}
                // The same Log it as a single "Activity detected" row: post it, or just log it.
                onLog={() => router.push({ pathname: '/compose', params: { activity: a.id } })}
              />
            ))}
          </WorkoutCard>
          <Pressable accessibilityRole="link" accessibilityLabel="Past workouts" onPress={() => router.push('/workouts')} hitSlop={8} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
            <Text style={styles.moreText}>Past workouts</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  wait: { paddingVertical: spacing.xxl, alignItems: 'center' },
  more: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  moreText: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
});
