import { useMemo } from 'react';

import type { Integration, User } from '@/data/types';
import { isTracker } from '@/features/activity/flags';
import type { TennisFlags } from '@/features/activity/flags';
import { sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { isTennisActivity } from '@/features/activity/workouts';
import { useApp } from '@/store/AppContext';
import { pickedPerWeek, realPerWeek, type PerWeek } from './tennisProfile';

/**
 * A tracker bringing in your tennis sessions: connected, its tennis sessions
 * switched on (readsWorkouts) and that source's switch on for this account
 * (flags, migrations 58 and 69). Apple Health counts only for tennis, not
 * for "every workout" alone.
 */
export function tennisTrackerOn(integrations: Integration[], flags: TennisFlags): boolean {
  return integrations.some((i) => i.connected && i.readsWorkouts && (
    i.provider === 'apple-health' ? flags.apple : i.provider === 'whoop' ? flags.whoop : isTracker(i.provider) ? flags[i.provider] : false
  ));
}

/**
 * The one sessions-a-week number on a player card. Your own, while a tracker
 * brings in your tennis: the real count, a week on average over the last
 * four weeks. Anyone else's, or yours without a tracker: what was picked in
 * setup (another player's sessions and trackers never reach this phone).
 */
export function usePerWeek(user: User): PerWeek | null {
  const { currentUserId, sessions, detectedActivities, integrations } = useApp();
  const flags = useTennisFlags();
  const mine = !!currentUserId && user.id === currentUserId;
  const tracker = mine && tennisTrackerOn(integrations, flags);
  return useMemo(() => {
    if (!tracker) return pickedPerWeek(user.profile);
    const waiting = detectedActivities.filter((a) => isTennisActivity(a) && sourceOn(a, flags));
    return { value: realPerWeek(sessions, waiting, user.id), real: true };
  }, [tracker, user.profile, user.id, sessions, detectedActivities, flags]);
}
