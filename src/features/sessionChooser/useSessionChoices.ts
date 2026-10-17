import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import type { DetectedActivity, TaggedCourt } from '@/data/types';
import { sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { recentPlaces, warmRecentPlaces } from '@/features/places/recents';
import type { WeekDay } from '@/features/players/tennisProfile';
import { computeStats, localDay } from '@/features/practice/stats';
import { weekRecap } from '@/features/recap/recap';
import { weekStart } from '@/features/records/records';
import { useApp } from '@/store/AppContext';

/**
 * What the Session sheet (+ → Session, app/new-session.tsx) shows, from the
 * same places the app already reads them:
 *  - `waiting`: your tracker's sessions nobody has logged yet, newest first,
 *    exactly the list "Log a session" offers (log-session.tsx);
 *  - `court`: your usual court, as Start a session would fill it in when
 *    you are not standing at one (the last court you tagged, else a court
 *    you follow), with why;
 *  - `week`, `weekMinutes`: this week, Monday to Sunday, and its time on
 *    court, worked out exactly as Your sessions' This week card and the
 *    Weekly recap do (weekRecap), the days after today marked `later`, so
 *    the strip's "This week" and theirs always give the same time;
 *  - `streak`: your streak, for the badge beside it.
 * Everything is worked out from what the app already holds, so the sheet
 * opens at its full height at once; only the court's name can arrive a
 * moment later, on a line that is there either way.
 */
export function useSessionChoices() {
  const { actions, currentUserId, detectedActivities, followedCourts, sessions, posts, stories } = useApp();
  const flags = useTennisFlags();
  const waiting = useMemo<DetectedActivity[]>(
    () => detectedActivities
      .filter((x) => x.userId === currentUserId && x.status === 'new' && sourceOn(x, flags))
      .sort((x, y) => y.startedAt.localeCompare(x.startedAt)),
    [detectedActivities, currentUserId, flags],
  );

  const [recent, setRecent] = useState<TaggedCourt | null>(null);
  useEffect(() => {
    if (!currentUserId) return undefined;
    let on = true;
    void warmRecentPlaces().then(() => {
      const last = recentPlaces(currentUserId)?.find((r) => r.court);
      if (on && last?.court) setRecent(last.court);
    });
    return () => { on = false; };
  }, [currentUserId]);
  useEffect(() => { if (followedCourts === null) void actions.loadFollowedCourts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const yours = followedCourts?.[0];
  const court: { name: string; why: string } | null = recent
    ? { name: recent.name, why: 'Last time' }
    : yours ? { name: yours.name ?? 'Tennis courts', why: 'Your court' } : null;

  const calendar = useMemo(() => {
    if (!currentUserId) return null;
    const today = localDay(new Date());
    const monday = weekStart(today);
    const recap = weekRecap(currentUserId, sessions, posts, stories, monday);
    const days: CalendarDay[] = recap.days.map((minutes, i) => {
      const d = new Date(`${monday}T12:00:00`);
      d.setDate(d.getDate() + i);
      const day = localDay(d);
      return { day, minutes, today: day === today, later: day > today };
    });
    return { days, minutes: recap.minutes };
  }, [currentUserId, sessions, posts, stories]);
  const week = calendar?.days ?? [];
  const weekMinutes = calendar?.minutes ?? 0;
  const streak = useMemo(() => (currentUserId ? computeStats(currentUserId, sessions, posts, stories).currentStreakDays : 0), [currentUserId, sessions, posts, stories]);

  return { waiting, court, week, weekMinutes, streak };
}

/** A day of the Monday-to-Sunday week: a WeekDay, and whether it is still to come. */
export interface CalendarDay extends WeekDay { later: boolean }

/*
 * Where each choice goes, the same pages as before, one step sooner (Oct 16,
 * owner: "Right when you click log session, it's like too many steps almost"):
 * Start → the Start a session sheet (court, Practice or Match, Start);
 * a tracker's session → its "Log it" page (Post session / Save privately),
 * through /log-session?activity= as the log list does; Log one yourself →
 * the by-hand form straight away (?hand=1), never the list first. Each takes
 * the Session sheet's place, so closing it goes back where + was pressed.
 * A tracker's session goes straight to its "Log it" page (/compose?activity=),
 * where /log-session?activity= only passed it on: a page fewer in between, so
 * the Session sheet's hand-over lands on it at once (Oct 16).
 */
export const goStart = () => router.replace('/start-session');
export const goLogTracker = (id: string) => router.replace({ pathname: '/compose', params: { activity: id } });
export const goLogByHand = () => router.replace({ pathname: '/log-session', params: { hand: '1' } });
