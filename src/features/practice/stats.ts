import type { PlayerStats, Post, PracticeSession, PublicStreak, Story } from '@/data/types';

/** A moment as a calendar day in this phone's own time zone: "2026-09-27". */
export function localDay(at: Date | string | number): string {
  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const previous = (day: string) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() - 1); return localDay(d); };

/** Every day you did something tennis: logged a session, or posted a clip, a photo or an Instant. */
export function activeDays(me: string, sessions: PracticeSession[], posts: Post[], stories: Story[]): Set<string> {
  const days = new Set<string>();
  for (const s of sessions) if (s.userId === me) days.add(s.day);
  for (const p of posts) if (p.authorId === me) days.add(localDay(p.createdAt));
  for (const st of stories) if (st.authorId === me) days.add(localDay(st.createdAt));
  return days;
}

/**
 * Your numbers, worked out from what you logged and posted. A streak counts
 * back from today, or from yesterday if today has nothing yet (it is not
 * over until the day is). Hours are on court: practice, matches and drills,
 * not gym sessions.
 */
export function computeStats(me: string, sessions: PracticeSession[], posts: Post[], stories: Story[], now = new Date()): PlayerStats {
  const mine = sessions.filter((s) => s.userId === me);
  const days = activeDays(me, sessions, posts, stories);
  const today = localDay(now);
  let cursor = days.has(today) ? today : previous(today);
  let current = 0;
  while (days.has(cursor)) { current += 1; cursor = previous(cursor); }
  let longest = 0;
  for (const day of days) {
    if (days.has(previous(day))) continue;
    let run = 0; let d = day;
    while (days.has(d)) { run += 1; const next = new Date(`${d}T12:00:00`); next.setDate(next.getDate() + 1); d = localDay(next); }
    longest = Math.max(longest, run);
  }
  const matches = mine.filter((s) => s.kind === 'match');
  return {
    sessionsLogged: mine.length,
    matchesPlayed: matches.length,
    matchesWon: matches.filter((s) => s.won).length,
    hoursOnCourt: Math.round(mine.filter((s) => s.kind !== 'fitness').reduce((sum, s) => sum + s.minutes, 0) / 60),
    currentStreakDays: current,
    longestStreakDays: Math.max(longest, current),
  };
}

/**
 * Your streak as others may see it beside your name (migration 134): the
 * number, and the last day it covers: today, or yesterday while today has
 * nothing yet. Nothing about what you logged or posted goes with it.
 */
export function publicStreak(me: string, sessions: PracticeSession[], posts: Post[], stories: Story[], now = new Date()): { days: number; through: string | null } {
  const days = computeStats(me, sessions, posts, stories, now).currentStreakDays;
  if (days <= 0) return { days: 0, through: null };
  const today = localDay(now);
  return { days, through: activeDays(me, sessions, posts, stories).has(today) ? today : previous(today) };
}

/**
 * Someone else's streak as it stands on this phone's today. The same rule as
 * your own: it lasts through the day after its last day (today is not over
 * yet), and is gone once that last day is before yesterday.
 */
export function streakToday(streak: PublicStreak, now = new Date()): number {
  return streak.through >= previous(localDay(now)) ? streak.days : 0;
}

/** Whether the streak is alive but today has nothing yet: the moment for a gentle reminder. */
export function streakAtRisk(me: string, sessions: PracticeSession[], posts: Post[], stories: Story[], now = new Date()): number {
  const days = activeDays(me, sessions, posts, stories);
  if (days.has(localDay(now))) return 0;
  return computeStats(me, sessions, posts, stories, now).currentStreakDays;
}
