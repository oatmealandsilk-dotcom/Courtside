import type { DetectedActivity, ID, Post, PracticeSession, SessionDetail } from '@/data/types';
import { localDay } from '@/features/practice/stats';
import { duration } from '@/lib/format';
import type { TennisFlags } from './flags';
import { activityDay, activityTitle, activityWhen, dayWords, loggedLabel, loggedTitle, sessionFromActivity, sessionFromLogged, statsSourceOf } from './format';

/*
 * Your recent sessions as one list, for attaching one to a Post or a Clip
 * and for "Your sessions": what a tracker picked up (logged or not) and what
 * you logged by hand. A session is never a post of its own (owner, Oct 2):
 * it rides on one post at most, and until then it stays in your private log.
 */

/** How far back a session can still be attached to a post: the two weeks your tracker's sessions are read for. */
export const ATTACH_DAYS = 14;

/**
 * One session to attach. A tracker's carries its own numbers (and, once
 * logged, the log entry it became); one you logged by hand carries how long
 * and what it was.
 */
export type SessionPick =
  | { type: 'tracker'; activity: DetectedActivity; session?: PracticeSession }
  | { type: 'logged'; session: PracticeSession };

/** Whether the server has tennis sessions switched on for a tracker's source (migration 58). */
export const sourceOn = (a: DetectedActivity, flags: TennisFlags) => (a.source === 'whoop' ? flags.whoop : a.source === 'apple-health' ? flags.apple : false);

/** Posts of yours that carry a session, by what they carry: 'a:<tracker id>' or 's:<log id>' → the post. */
export function postedIndex(posts: Post[], me: ID | null): Map<string, ID> {
  const index = new Map<string, ID>();
  if (!me) return index;
  for (const p of posts) {
    if (p.authorId !== me || !p.session) continue;
    if (p.session.activityId) index.set(`a:${p.session.activityId}`, p.id);
    if (p.session.sessionId) index.set(`s:${p.session.sessionId}`, p.id);
  }
  return index;
}

/** The post a session is already on, if any: through its tracker or its log entry, whichever the post was made from. */
export function postOf(pick: SessionPick, index: Map<string, ID>): ID | undefined {
  const a = pick.type === 'tracker' ? pick.activity.id : pick.session.activityId;
  const s = pick.session?.id;
  return (a ? index.get(`a:${a}`) : undefined) ?? (s ? index.get(`s:${s}`) : undefined);
}

/** When it started, as a number to sort by. A log entry made on the day it was played is placed at its time; one added later sits at noon that day. */
function startOf(pick: SessionPick): number {
  if (pick.type === 'tracker') return Date.parse(pick.activity.startedAt);
  const s = pick.session;
  return localDay(s.createdAt) === s.day ? Date.parse(s.createdAt) - s.minutes * 60_000 : Date.parse(`${s.day}T12:00:00`);
}

/**
 * Your sessions from the last `days` days, newest first. A tracker's session
 * is listed once: logged, it stands for its log entry too. One the tracker
 * saw but you hid, or that turned out to be a copy, is left out. A tracker's
 * whose source is switched off on the server is listed as the log entry it
 * became, if you logged it (time and kind, no tracker numbers).
 */
export function recentSessions({ me, sessions, activities, flags, days = ATTACH_DAYS, now = Date.now() }: {
  me: ID | null; sessions: PracticeSession[]; activities: DetectedActivity[]; flags: TennisFlags; days?: number; now?: number;
}): SessionPick[] {
  if (!me) return [];
  const since = now - days * 86_400_000;
  const firstDay = localDay(since);
  const picks: SessionPick[] = [];
  const shown = new Set<ID>();
  for (const a of activities) {
    if (a.userId !== me || (a.status !== 'new' && a.status !== 'logged') || !sourceOn(a, flags) || Date.parse(a.endedAt) < since) continue;
    const session = sessions.find((s) => s.activityId === a.id || (!!a.sessionId && s.id === a.sessionId));
    if (session) shown.add(session.id);
    picks.push({ type: 'tracker', activity: a, session });
  }
  for (const s of sessions) {
    if (s.userId !== me || shown.has(s.id) || s.day < firstDay) continue;
    picks.push({ type: 'logged', session: s });
  }
  return picks.sort((x, y) => startOf(y) - startOf(x));
}

/** What the post will carry. Heart rate only from a tracker, only when switched on, only for adults. */
export function statsOf(pick: SessionPick, showHr: boolean, adult: boolean): SessionDetail {
  return pick.type === 'tracker' ? sessionFromActivity(pick.activity, showHr, adult) : sessionFromLogged(pick.session);
}

/** "Tennis" (what the tracker called it), "Match · Won". */
export const pickTitle = (pick: SessionPick) => (pick.type === 'tracker' ? activityTitle(pick.activity) : loggedLabel(pick.session));

/**
 * The caption a post from this session gets when you leave yours empty:
 * "Saturday tennis" (the day, and what the tracker called it), "Tuesday
 * practice". Never the time of day.
 */
export const pickCaption = (pick: SessionPick) => (pick.type === 'tracker'
  ? `${new Date(`${activityDay(pick.activity)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} ${activityTitle(pick.activity).toLowerCase()}`
  : loggedTitle(pick.session));

/**
 * Where it came from, in a word or two: "WHOOP", "Apple Watch", or "By hand".
 * One logged from a tracker whose source is now switched off is listed as a
 * logged one, and says only "Tracker".
 */
export function pickSource(pick: SessionPick): string {
  if (pick.type === 'logged') return pick.session.activityId ? 'Tracker' : 'By hand';
  switch (statsSourceOf(pick.activity)) {
    case 'whoop': return 'WHOOP';
    case 'apple-watch': return 'Apple Watch';
    case 'apple-health': return 'Apple Health';
    case 'fitbit': return 'Fitbit';
    case 'oura': return 'Oura';
    case 'polar': return 'Polar';
    default: return 'Health Connect';
  }
}

/** "Today, 6:12–7:36 pm · 1h 24m · WHOOP" or "Yesterday · 1h 30m · By hand". */
export function pickLine(pick: SessionPick): string {
  const when = pick.type === 'tracker' ? activityWhen(pick.activity) : dayWords(pick.session.day);
  const minutes = pick.type === 'tracker' ? pick.activity.minutes : pick.session.minutes;
  return `${when} · ${duration(minutes)} · ${pickSource(pick)}`;
}

/** A tracker's session nobody has logged yet: attaching it logs it too. */
export const needsLogging = (pick: SessionPick) => pick.type === 'tracker' && pick.activity.status === 'new' && !pick.session;
