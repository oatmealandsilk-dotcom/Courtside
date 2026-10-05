import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { openingFromAlert } from '@/features/activity/check';
import { isDemo, tennisFlags } from '@/features/activity/flags';
import { listenForWorkoutAlertTaps, onWorkoutInFront, startWorkoutWatch, stopWorkoutWatch, workoutWatchAvailable, type WatchedWorkout } from '@/features/health/workoutWatch';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';

/**
 * The phone's own "Workout detected" alert (owner, Oct 5; from build 15, see
 * features/health/workoutWatch), wired to the app. Mounted once, in AppShell.
 *
 * - The watching follows the person's switches: on while Apple Health's
 *   tennis sessions (or every workout) are on and the server's switch for
 *   them is on, told again each time the app opens; off when they are turned
 *   off or the person signs out. Settings' alert switch for sessions
 *   (push_activity) is passed along, as the server honours it for WHOOP.
 * - With the app open on screen, a new workout is looked for at once, and
 *   the app's own note ("Workout detected · Log it") shows instead of an alert.
 * - A tap on the alert hands that workout to the server, as the check does,
 *   then opens Log it on it: the same page as the note's Log it and the row
 *   in Notifications. Once the app is signed in, loaded and past its opening
 *   page; Past workouts instead, if it can't be logged.
 *
 * On a build without the watching (14 and older, Android, a browser) it does nothing.
 */
export function useWorkoutWatch({ settled }: { settled: boolean }) {
  const { currentUserId, authResolved, remoteLoaded, onboardingComplete, healthIsReal, integrations, prefs, actions } = useApp();
  const available = workoutWatchAvailable();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const apple = integrations.find((i) => i.provider === 'apple-health');
  const whoop = integrations.find((i) => i.provider === 'whoop');
  const appleTennis = !!apple?.connected && !!apple.readsWorkouts;
  const appleAll = appleTennis && !!apple?.readsAllWorkouts;
  const whoopTennis = !!whoop?.connected && !!whoop.readsWorkouts;
  const alerts = prefs.pushActivity;
  // A real account, loaded, with its Health connections read (only then are the switches above its own).
  const ready = isSupabaseConfigured && !!currentUserId && !isDemo(currentUserId) && remoteLoaded && onboardingComplete && !!healthIsReal;

  useEffect(() => {
    if (!available || !authResolved) return undefined;
    // Signed out: no alerts for an account that is not here.
    if (!currentUserId) { void stopWorkoutWatch(); return undefined; }
    if (!ready) return undefined;
    let stale = false;
    void tennisFlags(currentUserId).then((f) => {
      if (stale) return;
      // The same rules as the check's (checkWith in AppContext): tennis, and every workout only on its own yes.
      const tennis = f.apple && appleTennis;
      const workouts = f.workoutsApple && appleAll;
      if (tennis || workouts) void startWorkoutWatch({ tennis, workouts, skipWhoopTennis: f.whoop && whoopTennis, alerts });
      else void stopWorkoutWatch();
    });
    return () => { stale = true; };
  }, [available, authResolved, currentUserId, ready, appleTennis, appleAll, whoopTennis, alerts]);

  // Open on screen: look now (Apple Health's look is otherwise held to once every two minutes).
  useEffect(() => {
    if (!available || !ready) return undefined;
    return onWorkoutInFront(() => { void actionsRef.current.checkForActivities(true); });
  }, [available, ready]);

  // The alert's tap: held until the app can act on it (a tap that opened the app arrives before sign-in is read).
  const [tapped, setTapped] = useState<WatchedWorkout | null>(null);
  useEffect(() => (available ? listenForWorkoutAlertTaps((w) => { openingFromAlert(w.id); setTapped(w); }) : undefined), [available]);
  useEffect(() => {
    if (!tapped || !ready || !settled) return;
    const w = tapped;
    setTapped(null);
    void actionsRef.current.reportWorkoutFromAlert(w).catch(() => null).then((id) => {
      if (id) router.push(`/compose?activity=${id}` as never);
      else router.push('/workouts');
    });
  }, [tapped, ready, settled]);
}
