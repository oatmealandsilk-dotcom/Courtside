import type { ID, User } from '@/data/types';
import { isSupabaseConfigured } from '@/lib/supabase';
import { streakToday } from './stats';

/** The flame shows beside a name from this many days in a row (the owner's call, Oct 5). */
export const STREAK_FLAME_FROM = 3;

/**
 * The streak to show beside this player's name, or 0 for none (under 3 days,
 * or over). Yours is your own live count (the same as the "6-day streak" pill
 * on your profile). Anyone else's is the number their app put up (migration
 * 134), as long as it is still running on this phone's today. In the demo,
 * with no server, the sample players carry their own numbers.
 */
export function shownStreak(user: Pick<User, 'id' | 'stats' | 'streak'> | null | undefined, me: ID | null, now = new Date()): number {
  if (!user) return 0;
  const days = user.id === me ? user.stats.currentStreakDays
    : user.streak ? streakToday(user.streak, now)
      : isSupabaseConfigured ? 0 : user.stats.currentStreakDays;
  return days >= STREAK_FLAME_FROM ? days : 0;
}

/**
 * What others see of a streak put up as this (migration 134): its number and
 * last day, or '' for no flame at all (under 3 days). Two that match need no
 * new send; a server holding 2 days and a phone at 1 both show nothing.
 */
export const streakSeen = (streak: { days: number; through: string | null }) =>
  (streak.days >= STREAK_FLAME_FROM && streak.through ? `${streak.days}:${streak.through}` : '');

/** What a screen reader hears for it: "12-day streak". */
export const streakLabel = (days: number) => `${days}-day streak`;

/** The same tacked onto a row's own label (", 12-day streak"), or nothing when there is no flame. */
export const streakWords = (days: number) => (days ? `, ${streakLabel(days)}` : '');
