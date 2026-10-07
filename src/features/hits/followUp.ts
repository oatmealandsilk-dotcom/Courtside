import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DetectedActivity, HitRequest, ID, LiveSession, PracticeSession, User } from '@/data/types';
import { liveSpan } from '@/features/activity/liveSession';
import { sourceOn } from '@/features/activity/recent';
import { isTennisActivity } from '@/features/activity/workouts';
import type { TennisFlags } from '@/features/activity/flags';
import { localDay } from '@/features/practice/stats';
import { isMapCourtId } from '@/features/places/courtName';

/*
 * "How was the hit?": once a hit you posted or joined is over, the next
 * time the app is open it asks, once, lightly, whether you want to log it
 * (components/HitFollowUp). Never for a hit that was called off, never twice
 * for the same hit on this device, and not for one you have already logged,
 * by hand or from your tracker.
 */

/** A hit has no end of its own: it is taken to be over this long after it starts. */
export const HIT_MINUTES = 90;
/** Past this, a hit is old news and is not asked about (an older one can still be logged by hand, on its day). */
const STALE_MS = 36 * 3_600_000;

export const hitEnd = (h: HitRequest) => Date.parse(h.startsAt) + HIT_MINUTES * 60_000;

/** You played it: your own hit someone joined, or one you joined. */
const played = (h: HitRequest, me: ID) => (h.authorId === me ? h.joinedIds.some((id) => id !== me) : h.joinedIds.includes(me));

/**
 * The session your tracker picked up during a hit, if it did: one that ran
 * between half an hour before the hit's start and three hours after, waiting
 * to be logged or logged already, from a source the server has switched on.
 * Logging the hit by hand as well would count the same game twice (hours,
 * matches, win rate), so a logged one means the hit is done, and a waiting
 * one is what "Log it" logs.
 */
export function trackerFor(h: HitRequest, { me, activities, flags }: { me: ID; activities: DetectedActivity[]; flags: TennisFlags }): DetectedActivity | undefined {
  const from = Date.parse(h.startsAt) - 30 * 60_000;
  const to = Date.parse(h.startsAt) + 3 * 3_600_000;
  // Tennis only: a run that morning is not the hit (Oct 5).
  return activities.find((a) => a.userId === me && isTennisActivity(a) && (a.status === 'new' || a.status === 'logged') && sourceOn(a, flags)
    && Date.parse(a.startedAt) < to && Date.parse(a.endedAt) > from);
}

/**
 * A session you started live (Start to Finish, Oct 6) that ran during the
 * hit, in the same window as a tracker's copy (trackerFor): the hit was
 * timed there, so it is that session's to log, and "How was the hit?" never
 * asks about it as well (owner: no double logging). Once that session is
 * logged, the log itself stands for the hit, as any log since it started does.
 */
export function liveCovers(h: HitRequest, live: LiveSession | null | undefined, me: ID, now = Date.now()): boolean {
  if (!live || live.userId !== me) return false;
  const { from, to } = liveSpan(live, now);
  const start = Date.parse(h.startsAt);
  return from < start + 3 * 3_600_000 && to > start - 30 * 60_000;
}

/**
 * The hits to ask about now, newest first: over, played, from today or
 * yesterday, not called off, not asked about on this device, with nothing
 * logged since they started, not already logged from your tracker, and not
 * timed by a live session of yours that is still waiting to be logged.
 */
export function dueHits(hits: HitRequest[], { me, sessions, activities, flags, asked, live, now = Date.now() }: { me: ID; sessions: PracticeSession[]; activities: DetectedActivity[]; flags: TennisFlags; asked: Set<ID>; live?: LiveSession | null; now?: number }): HitRequest[] {
  const days = [localDay(now), localDay(now - 86_400_000)];
  return hits
    .filter((h) => {
      if (h.cancelled || asked.has(h.id) || !played(h, me)) return false;
      const end = hitEnd(h);
      if (end > now || now - end > STALE_MS) return false;
      const day = localDay(h.startsAt);
      if (!days.includes(day)) return false;
      if (trackerFor(h, { me, activities, flags })?.status === 'logged') return false;
      if (liveCovers(h, live, me, now)) return false;
      return !sessions.some((s) => s.userId === me && s.day === day && Date.parse(s.createdAt) >= Date.parse(h.startsAt));
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** When the next of your hits ends within a few hours, to look again then; null when none does. */
export function nextHitEnd(hits: HitRequest[], me: ID, now = Date.now()): number | null {
  const ends = hits.filter((h) => !h.cancelled && played(h, me)).map(hitEnd).filter((t) => t > now && t - now < 6 * 3_600_000);
  return ends.length ? Math.min(...ends) : null;
}

/* ------------------------------------------- asked about, on this device */

const askedKey = (me: ID) => `courtside-hit-asked:${me}`;
/** Kept in memory too, so a phone that refuses storage still never asks twice while the app is open. */
const askedHere = new Set<string>();

/**
 * The hits this device already asked this account about. Null when storage
 * could not be read: then nothing is asked, since asking twice is worse
 * than not asking.
 */
export async function readAsked(me: ID): Promise<Set<ID> | null> {
  try {
    const raw = await AsyncStorage.getItem(askedKey(me));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    return new Set([...ids, ...[...askedHere].filter((k) => k.startsWith(`${me}:`)).map((k) => k.slice(me.length + 1))]);
  } catch {
    return null;
  }
}

/** Remembers these hits as asked about, keeping the last 60. */
export async function markAsked(me: ID, ids: ID[]): Promise<void> {
  ids.forEach((id) => askedHere.add(`${me}:${id}`));
  try {
    const before = (await readAsked(me)) ?? new Set<ID>();
    const all = [...before, ...ids.filter((id) => !before.has(id))].slice(-60);
    await AsyncStorage.setItem(askedKey(me), JSON.stringify(all));
  } catch { /* the in-memory copy still holds for this run */ }
}

/* ------------------------------------------- what the log sheet starts with */

export interface HitPrefill {
  hitId: ID;
  kind: 'practice' | 'match';
  minutes: number;
  /** The day it was played, on this phone's clock. */
  day: string;
  place: string;
  /** The map's id for the court, when the hit was at one: kept with the session in your log (migration 130), for Flyby. */
  placeId?: string;
  /** First names of the others: "Mira", "Mira and Dev", "Mira, Dev and Sam". Empty when none are known. */
  who: string;
  /** The others who played, as CourtSide players: offered first in "Who you played", ready to tag. */
  playerIds: ID[];
}

/** "Mira, Dev and Sam". */
function namesOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The log sheet filled in from a hit: a match for singles or doubles, practice
 * for just hitting; its usual length; its day; where; and who else played.
 */
export function prefillFor(h: HitRequest, me: ID, users: User[]): HitPrefill {
  const others = [h.authorId, ...h.joinedIds].filter((id, i, all) => id !== me && all.indexOf(id) === i);
  const names = others.map((id) => users.find((u) => u.id === id)?.name.split(' ')[0]).filter((n): n is string => !!n);
  return {
    hitId: h.id, kind: h.format === 'hit' ? 'practice' : 'match', minutes: HIT_MINUTES, day: localDay(h.startsAt), place: h.place.name,
    ...(isMapCourtId(h.place.id) ? { placeId: h.place.id } : {}),
    who: namesOf(names), playerIds: others.filter((id) => users.some((u) => u.id === id)),
  };
}

/** A place name short enough for one line of a note at the top of the screen: "Riverside Park Tennis C…". */
export function shortPlace(name: string, max = 26): string {
  const first = name.split(/\s[-–—]\s|,/)[0].trim() || name;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

// The prompt hands the log sheet its words here, not through the address
// (who played stays out of a browser's history); the sheet falls back to the
// hit itself if the app was reloaded on the way.
const prefills = new Map<ID, HitPrefill>();
export const keepHitPrefill = (p: HitPrefill) => { prefills.set(p.hitId, p); };
export const hitPrefill = (hitId: ID) => prefills.get(hitId);
