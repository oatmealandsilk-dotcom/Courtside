import type { ID, Post, PracticeSession, Story } from '@/data/types';
import { beaten, computeRecords, streakRuns, weekStart, type RecordBeat } from '@/features/records/records';
import { activeDays, localDay } from '@/features/practice/stats';
import { duration } from '@/lib/format';

/*
 * The weekly recap (owner, Oct 5: "weekly [recap] is good too"): last week
 * next to the week before, the way Strava's Monday note reads. The server
 * sends the alert on Mondays at 8am your time (send_weekly_recaps, migration
 * 130); the card itself is worked out here, from your own log, by the same
 * rules, so the alert's words and the card always agree:
 *
 *   - time and sessions are tennis (practice, matches, drills), never the gym;
 *   - "up 2h" when last week beat the week before (nothing said when it didn't);
 *   - the line ends with the first of: "Your biggest week yet." (more than
 *     any earlier week, which had at least an hour), "Best streak yet." (a
 *     run of days in a row reaching into the week, longer than any before it,
 *     which was at least 3; a day counts with a session, a post or an
 *     Instant), or "2 matches won.";
 *   - a rest week after a played one: "A quiet week. You played 3h the week
 *     before — up for a hit?"; nothing in either week, no recap.
 */

export interface WeekRecap {
  /** Monday and Sunday, 'YYYY-MM-DD'. */
  week: string;
  end: string;
  minutes: number;
  sessions: number;
  won: number;
  lost: number;
  prevMinutes: number;
  prevSessions: number;
  /** Tennis minutes on each day, Monday first. */
  days: number[];
  bestWeek: boolean;
  /** The most time in any earlier week (0 when none), and that week's Monday: "Beat your old best, 3h 50m (Sep 21 – 27)". */
  bestBefore: number;
  bestBeforeWeek?: string;
  /** No tennis in your log before this week: the first week you played here. */
  firstWeek: boolean;
  bestStreak: boolean;
  /** The longest run of days in a row reaching into the week (its days before the week included), and its first and last day. */
  streak: number;
  streakFrom?: string;
  streakTo?: string;
  /** Personal records beaten during the week. */
  records: RecordBeat[];
  /** The alert's words, or null when there is nothing to say. */
  line: string | null;
}

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d); };
const isTennis = (s: PracticeSession) => s.kind !== 'fitness';

/** The Monday of last week, on this phone's clock. */
export function lastWeekStart(now = new Date()): string {
  return addDays(weekStart(localDay(now)), -7);
}

/** "Sep 28 – Oct 4", "Sep 21 – 27". */
export function weekRange(start: string): string {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${addDays(start, 6)}T12:00:00`);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()} – ${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

/** A week's recap from your own log; `week` is its Monday. */
export function weekRecap(me: ID, sessions: PracticeSession[], posts: Post[], stories: Story[], week: string): WeekRecap {
  const end = addDays(week, 6);
  const mine = sessions.filter((s) => s.userId === me);
  const tennis = mine.filter(isTennis);
  const inWeek = tennis.filter((s) => s.day >= week && s.day <= end);
  const prev = tennis.filter((s) => s.day >= addDays(week, -7) && s.day < week);
  const minutes = inWeek.reduce((sum, s) => sum + s.minutes, 0);
  const prevMinutes = prev.reduce((sum, s) => sum + s.minutes, 0);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => inWeek.filter((s) => s.day === addDays(week, i)).reduce((sum, s) => sum + s.minutes, 0));

  // The most time on court in any earlier week (the 400 days the app holds).
  const weeks = new Map<string, number>();
  for (const s of tennis) if (s.day < week && s.day >= addDays(week, -400)) weeks.set(weekStart(s.day), (weeks.get(weekStart(s.day)) ?? 0) + s.minutes);
  const bestBefore = Math.max(0, ...weeks.values());
  // The first week to reach it holds it (the same rule as the records).
  const bestBeforeWeek = bestBefore ? [...weeks].filter(([, m]) => m === bestBefore).map(([w]) => w).sort()[0] : undefined;
  const firstWeek = !tennis.some((s) => s.day < week);

  // Streaks, counted only up to the week's end.
  const all = activeDays(me, sessions, posts, stories);
  const upTo = new Set([...all].filter((d) => d <= end && d >= addDays(week, -400)));
  const runs = streakRuns(upTo);
  const reaching = runs.filter((r) => r.to >= week).sort((a, b) => b.length - a.length)[0];
  const before = Math.max(0, ...runs.filter((r) => r.to < week).map((r) => r.length));
  const streak = reaching?.length ?? 0;

  const won = inWeek.filter((s) => s.kind === 'match' && s.won === true).length;
  const lost = inWeek.filter((s) => s.kind === 'match' && s.won === false).length;
  const bestWeek = inWeek.length > 0 && bestBefore >= 60 && minutes > bestBefore;
  const bestStreak = before >= 3 && streak > before;

  // The records the week beat: your records before it, against your records at its end.
  const by = (day: string) => (p: { createdAt: string }) => localDay(p.createdAt) <= day;
  const recordsBefore = computeRecords(me, mine.filter((s) => s.day < week), posts.filter(by(addDays(week, -1))), stories.filter(by(addDays(week, -1))));
  const recordsAfter = computeRecords(me, mine.filter((s) => s.day <= end), posts.filter(by(end)), stories.filter(by(end)));

  return {
    week, end, minutes, sessions: inWeek.length, won, lost, prevMinutes, prevSessions: prev.length, days,
    bestWeek, bestBefore, ...(bestBeforeWeek ? { bestBeforeWeek } : {}), firstWeek, bestStreak, streak, streakFrom: reaching?.from, streakTo: reaching?.to,
    records: beaten(recordsBefore, recordsAfter),
    line: recapLine({ minutes, sessions: inWeek.length, won, prevMinutes, prevSessions: prev.length, bestWeek, bestStreak }),
  };
}

/** The alert's words, exactly as the server writes them (weekly_recap_numbers). */
export function recapLine(r: { minutes: number; sessions: number; won: number; prevMinutes: number; prevSessions: number; bestWeek: boolean; bestStreak: boolean }): string | null {
  if (!r.sessions) return r.prevSessions ? `A quiet week. You played ${duration(r.prevMinutes)} the week before — up for a hit?` : null;
  const up = r.prevSessions && r.minutes > r.prevMinutes ? ` — up ${duration(r.minutes - r.prevMinutes)}` : '';
  const tail = r.bestWeek ? 'Your biggest week yet.'
    : r.bestStreak ? 'Best streak yet.'
      : r.won ? `${r.won} ${r.won === 1 ? 'match' : 'matches'} won.` : '';
  return `${duration(r.minutes)}, ${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'}${up}.${tail ? ` ${tail}` : ''}`;
}

/** "Up 2h on the week before", "Down 45 min on the week before", "Same as the week before", or nothing the first week. */
export function compareLine(r: Pick<WeekRecap, 'minutes' | 'prevMinutes' | 'prevSessions'>): string | null {
  if (!r.prevSessions) return null;
  if (r.minutes === r.prevMinutes) return 'Same as the week before';
  return r.minutes > r.prevMinutes ? `Up ${duration(r.minutes - r.prevMinutes)} on the week before` : `Down ${duration(r.prevMinutes - r.minutes)} on the week before`;
}

/**
 * Whether the "Your week" card belongs at the top of Your sessions now:
 * Monday to Wednesday, about last week, when there is something to say.
 */
export function showWeekCard(r: WeekRecap, now = new Date()): boolean {
  const weekday = (now.getDay() + 6) % 7;
  return weekday <= 2 && !!r.line && r.week === lastWeekStart(now);
}
