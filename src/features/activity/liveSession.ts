import { useEffect, useState } from 'react';

import type { CourtAccess, CourtRightNow, DetectedActivity, ID, LiveSession, MapVisibility, TaggedCourt, User } from '@/data/types';
import type { TennisFlags } from '@/features/activity/flags';
import { sourceOn } from '@/features/activity/recent';
import { isTennisActivity } from '@/features/activity/workouts';
import { isMapCourtId } from '@/features/places/courtName';
import { canCheckIn } from '@/features/players/mapPrivacy';
import { localDay } from '@/features/practice/stats';

/*
 * A session played live (Oct 6, owner: "click start when they start a
 * session, and finish when they finish, like Strava"): the clock, how it
 * reads, and who can see you while it runs. The session itself lives in
 * AppContext (store/liveSession); these are the plain sums around it.
 */

/** The kinds Start offers, the log sheet's tennis three in its own order. */
export const LIVE_KINDS: { value: LiveSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'drills', label: 'Drills' },
];

/** The shortest and longest a session can be logged at (the database's 5 to 600 minutes, migration 39). */
const MIN_MINUTES = 5;
const MAX_MINUTES = 600;

/** How long it has been going, pauses left out, in milliseconds: stopped at Finish, standing still while paused. */
export function elapsedMs(s: Pick<LiveSession, 'startedAt' | 'pausedAt' | 'pausedMs' | 'endedAt'>, now = Date.now()): number {
  const until = s.endedAt ? Date.parse(s.endedAt) : s.pausedAt ? Date.parse(s.pausedAt) : now;
  return Math.max(0, until - Date.parse(s.startedAt) - (s.pausedMs || 0));
}

/** The clock as a stopwatch reads it: "0:42:07", "1:05:30". */
export function clockText(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** The clock read aloud: "42 minutes 7 seconds", "1 hour 5 minutes". */
export function spokenClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const parts = [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minute${m === 1 ? '' : 's'}` : '', !h && sec ? `${sec} second${sec === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : '0 seconds';
}

/** The minutes the log is filled in with: the clock, to the nearest minute, within what a log can hold. */
export function liveMinutes(s: LiveSession, now = Date.now()): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(elapsedMs(s, now) / 60_000)));
}

/** The day it goes in your log: the day it started, in your own time zone. */
export const liveDay = (s: Pick<LiveSession, 'startedAt'>) => localDay(new Date(s.startedAt));

/** "6:02pm": when it started, as a clock on the wall says it. */
export function startClock(s: Pick<LiveSession, 'startedAt'>): string {
  return new Date(s.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M$/i, (_, x: string) => `${x.toLowerCase()}m`);
}

/** Where it is, in words: the court, the place typed, or nothing said. */
export const livePlace = (s: Pick<LiveSession, 'court' | 'place'>) => s.court?.name ?? s.place ?? '';

/** Running, paused, or stopped at Finish and waiting to be logged. */
export type LiveState = 'running' | 'paused' | 'finished';
export const liveState = (s: Pick<LiveSession, 'pausedAt' | 'endedAt'>): LiveState => (s.endedAt ? 'finished' : s.pausedAt ? 'paused' : 'running');

/**
 * The time now, again every second while `ticking`: what makes a clock on
 * screen run. Only the bar and the live page ask; nothing is kept but the
 * session's own start, so a phone asleep for an hour shows the right time
 * the moment it wakes.
 */
export function useLiveNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return undefined;
    // On the next whole second, then every second, so the seconds turn over together everywhere.
    let timer: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    }, 1000 - (Date.now() % 1000) + 5);
    return () => { clearTimeout(first); if (timer) clearInterval(timer); };
  }, [ticking]);
  return now;
}

/**
 * Whether Start checks you in at the court, and if not, why, by the court
 * sheet's own rules (app/court-now, mapPrivacy.canCheckIn): only at a court
 * on the map anyone may play at, only someone known to be an adult, never
 * with Only me chosen, and only with Location on (the server checks you are
 * really there). Nothing new is decided here.
 */
export function checkInPlan({ me, court, access, locationOn, seenBy }: {
  me: User | null | undefined;
  court?: TaggedCourt | null;
  access?: CourtAccess;
  locationOn: boolean;
  seenBy: MapVisibility | null;
}): { checkIn: boolean; why?: 'no-court' | 'not-on-map' | 'cannot' | 'only-me' | 'location-off' } {
  if (!court) return { checkIn: false, why: 'no-court' };
  if (!isMapCourtId(court.id)) return { checkIn: false, why: 'not-on-map' };
  if (!canCheckIn(me, access)) return { checkIn: false, why: 'cannot' };
  if (seenBy === 'none') return { checkIn: false, why: 'only-me' };
  if (!locationOn) return { checkIn: false, why: 'location-off' };
  return { checkIn: true };
}

/**
 * Who can see you playing, in a line, as the court sheet says it ("I'm
 * playing here"): `here` while you are checked in at the court; otherwise
 * only you, with why when it is something you can change.
 */
export function seenLine({ here, seenBy, why, problem, starting = false }: {
  here: boolean;
  seenBy: MapVisibility | null;
  why?: ReturnType<typeof checkInPlan>['why'];
  /** The check-in's own refusal, when it was tried. */
  problem?: string;
  /** Said before Start: "will see". */
  starting?: boolean;
}): { line: string; shared: boolean; note?: string } {
  const can = starting ? 'will see' : 'can see';
  if (here) {
    if (seenBy === 'nearby') return { line: `Friends and players nearby ${can} you’re playing here`, shared: true };
    if (seenBy === 'mutuals') return { line: `Friends who follow you back ${can} you’re playing here`, shared: true };
    return { line: `Friends ${can} you’re playing here`, shared: true };
  }
  const only = starting ? 'Only you will see this session' : 'Only you can see this session';
  if (why === 'location-off') return { line: only, shared: false, note: 'Turn on Location to let friends see you’re here.' };
  if (why === 'only-me') return { line: only, shared: false, note: 'You chose Only me on the map.' };
  if (problem) return { line: only, shared: false, note: problem };
  return { line: only, shared: false };
}

/**
 * Your own pin's "Playing now · <court>" on the map (Oct 6): only while you
 * are checked in at the live session's court, with Location on, so the map
 * says exactly what the check-in shares (a teen, Only me, Location off or a
 * club's court never checks in, and never shows it).
 */
export function livePin(s: LiveSession | null, courtNow: Record<string, CourtRightNow>, locationOn: boolean): { courtId: string; courtName: string } | null {
  if (!s?.court || !locationOn || liveState(s) === 'finished') return null;
  return courtNow[s.court.id]?.youHere ? { courtId: s.court.id, courtName: s.court.name } : null;
}

/* ------------------------------------------------ one game, logged once */

/** When the live session ran, on the clock on the wall: Start to Finish, or to now (a pause still standing counts as now). */
export function liveSpan(s: Pick<LiveSession, 'startedAt' | 'endedAt'>, now = Date.now()): { from: number; to: number } {
  const from = Date.parse(s.startedAt);
  const to = s.endedAt ? Date.parse(s.endedAt) : now;
  return { from, to: Math.max(from, to) };
}

/**
 * Whether a tracker's workout and a live session are the same game, by the
 * server's own rule for one session seen twice (WHOOP and the Watch, say;
 * note_detected_activity, migration 138): they started within ten minutes
 * of each other, or they overlap for at least half the shorter of the two.
 */
function sameGame(span: { from: number; to: number }, a: Pick<DetectedActivity, 'startedAt' | 'endedAt'>): boolean {
  const from = Date.parse(a.startedAt);
  const to = Date.parse(a.endedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(span.from)) return false;
  if (Math.abs(from - span.from) <= 10 * 60_000) return true;
  const overlap = Math.min(to, span.to) - Math.max(from, span.from);
  return overlap > 0 && overlap >= 0.5 * Math.min(to - from, span.to - span.from);
}

/** How much of the live session a workout covers, to pick the fullest copy. */
const cover = (span: { from: number; to: number }, a: DetectedActivity) => Math.min(Date.parse(a.endedAt), span.to) - Math.max(Date.parse(a.startedAt), span.from);

/**
 * Your tracker's copy of the game the live session timed (Oct 6, owner: no
 * double logging): a tennis session from your Apple Watch, WHOOP, Fitbit…
 * over the same time, from a source the server has switched on, found the
 * way "How was the hit?" finds one (features/hits/followUp, trackerFor).
 *
 * `waiting` is one nobody has logged yet: the live session is logged as it
 * (logSession's activityId, the link "Log it" makes, migration 58), so your
 * log gets its heart rate and calories and the workout counts as logged,
 * never offered again. A copy arriving after the log is folded in by the
 * server (logged by hand, migration 138). `logged` is one already in your
 * log: the sheet says so, as saving again would count the same game twice.
 * Tennis only, as for a hit: a run that morning is not the session.
 */
export function liveTracker(s: LiveSession, activities: DetectedActivity[], { me, flags, now = Date.now() }: { me: ID; flags: TennisFlags; now?: number }): { waiting?: DetectedActivity; logged?: DetectedActivity } {
  const span = liveSpan(s, now);
  const same = activities.filter((a) => a.userId === me && isTennisActivity(a) && sourceOn(a, flags) && sameGame(span, a));
  const fullest = (list: DetectedActivity[]) => [...list].sort((x, y) => cover(span, y) - cover(span, x))[0];
  return { waiting: fullest(same.filter((a) => a.status === 'new')), logged: fullest(same.filter((a) => a.status === 'logged')) };
}

/* ------------------------------------------------ "Still playing?" */

/** A session whose clock has run this long is asked about (Oct 6, owner): Finish, or Keep going. */
export const STILL_PLAYING_MS = 3 * 3_600_000;
/** "Keep going" (or the question put away) asks again this much later. */
export const STILL_PLAYING_AGAIN_MS = 2 * 3_600_000;
/** The phone's own alert for it, by name: a new one replaces the old, and Finish or a pause takes it away. */
export const STILL_PLAYING_ALERT = 'courtside-still-playing';

/**
 * When to ask "Still playing?", on the clock on the wall: once the session's
 * clock reaches three hours (pauses left out), and, once asked, two hours
 * after that. Null while paused or finished: there is nothing to ask then.
 */
export function stillPlayingAt(s: LiveSession | null): number | null {
  if (!s || liveState(s) !== 'running') return null;
  const atThree = Date.parse(s.startedAt) + (s.pausedMs || 0) + STILL_PLAYING_MS;
  const again = s.stillAskedAt ? Date.parse(s.stillAskedAt) + STILL_PLAYING_AGAIN_MS : 0;
  return Math.max(atThree, Number.isFinite(again) ? again : 0);
}

/** "3 hours", "4 hours 20 minutes": how long the clock has run, in words, for the question. */
export function hoursWords(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m >= 5 || !h ? `${m} minutes` : ''].filter(Boolean).join(' ');
}
