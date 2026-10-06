import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { ID } from '@/data/types';
import { openingFromAlert } from '@/features/activity/check';
import { isDemo, tennisFlagsKnown } from '@/features/activity/flags';
import { foundHref } from '@/features/activity/found';
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
 *   off, or the server says its switch is off. Settings' alert switch for
 *   sessions (push_activity) is passed along, as the server honours it for
 *   WHOOP. Signing out (or deleting the account) stops it in the store
 *   itself (AppContext), not here: an open with no session to be read (a
 *   wake in the background, offline, with the sign-in out of date) looks
 *   signed out here, and must leave the watching exactly as it was. So must
 *   an open where the server's switches could not be asked.
 * - With the app open on screen, a new workout is looked for at once, and
 *   the app's own note ("Workout detected · Log it") shows instead of an alert.
 * - A tap on the alert hands that workout to the server, as the check does,
 *   then opens Log it on it: the same page as the note's Log it and the row
 *   in Notifications. Once the app is signed in, loaded and past its opening
 *   page; Past workouts instead, if it can't be logged. A tap on the one
 *   "4 workouts found" alert (more than three saved at once, Oct 5) hands
 *   each over, then opens their list (Workouts found), each with Log it.
 *
 * On a build without the watching (14 and older, Android, a browser) it does nothing.
 */
export function useWorkoutWatch({ settled }: { settled: boolean }) {
  const { currentUserId, remoteLoaded, onboardingComplete, healthIsReal, integrations, prefs, actions } = useApp();
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
    // Not signed in and loaded (or not yet): left as it is (see above).
    if (!available || !ready) return undefined;
    // Their own switch is off (read from the server just now, with the rest of their Health connections).
    if (!appleTennis) { void stopWorkoutWatch(); return undefined; }
    let stale = false;
    void tennisFlagsKnown(currentUserId).then((f) => {
      // The server could not be asked: left as it is, until an open that can ask.
      if (stale || !f) return;
      // The same rules as the check's (checkWith in AppContext): tennis, and every workout only on its own yes.
      const tennis = f.apple;
      const workouts = f.workoutsApple && appleAll;
      if (tennis || workouts) void startWorkoutWatch({ tennis, workouts, skipWhoopTennis: f.whoop && whoopTennis, alerts });
      else void stopWorkoutWatch();
    });
    return () => { stale = true; };
  }, [available, currentUserId, ready, appleTennis, appleAll, whoopTennis, alerts]);

  // Open on screen: look now (Apple Health's look is otherwise held to once every two minutes).
  useEffect(() => {
    if (!available || !ready) return undefined;
    return onWorkoutInFront(() => { void actionsRef.current.checkForActivities(true); });
  }, [available, ready]);

  // The alert's tap: held until the app can act on it (a tap that opened the app arrives before sign-in is read).
  const [tapped, setTapped] = useState<{ list: WatchedWorkout[]; grouped: boolean } | null>(null);
  useEffect(() => (available ? listenForWorkoutAlertTaps((list, grouped) => { for (const w of list) openingFromAlert(w.id); setTapped({ list, grouped }); }) : undefined), [available]);
  useEffect(() => {
    if (!tapped || !ready || !settled) return;
    const { list, grouped } = tapped;
    setTapped(null);
    // "4 workouts found" (more than three at once): each handed over, then their list, each with its own Log it.
    if (grouped) {
      void actionsRef.current.reportWorkoutsFromAlert(list).catch((): ID[] => []).then((ids) => {
        router.push((ids.length ? foundHref(ids) : '/workouts-found') as never);
      });
      return;
    }
    const w = list[0];
    if (!w) return;
    void actionsRef.current.reportWorkoutFromAlert(w).catch(() => null).then((id) => {
      if (id) router.push(`/compose?activity=${id}` as never);
      else router.push('/workouts');
    });
  }, [tapped, ready, settled]);
}
