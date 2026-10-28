import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import type { CourtAccess, CourtRightNow, ID, User } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { isMapCourtId } from '@/features/places/courtName';
import { checkInEnds, clock } from '@/features/players/checkIn';
import { fetchCourts, isClosedCourt, peekCourts, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { canCheckIn } from '@/features/players/mapPrivacy';
import type { MapModel, Placed } from '@/features/players/mapModel';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';

/*
 * Light up (Oct 27, owner: "what if courts light up when people check in
 * there"; then, of the word "Check in": "i dont like how it says check in,
 * whats a better thing more encourgaing to peplel", and "go" to "Light up").
 *
 * 1. The words, for everyone: the button that shares your spot with friends
 *    says "Light up"; while on, "You're lit up · till 10pm" ("for 2 hours"
 *    late), "Lit · 10pm" on the Find Players card; "Turn off" stops it. What
 *    it does is unchanged (migration 189): one tap, read once, friends who
 *    follow each other with you, until 10pm, never on its own.
 *
 * 2. Courts light up (LIGHT_UP_COURTS_FOR_EVERYONE, admins first): on the
 *    maps (the card and the full map, phone and browser alike: the pins are
 *    the same HTML in both, markers.ts), a court glows by how much is on
 *    there right now: people playing there ("I'm playing here", which a
 *    light-up at a court now does too) and open hits there today. Quiet as
 *    ever with nothing on; warm (1), lit (2 or 3), hot (4 or more): a soft,
 *    still halo in the theme's brand colour, a little bigger each level, and
 *    the small count ("4 here"). Only counts, as the server already gives
 *    them (court_right_now, migration 189): a stranger is counted only once
 *    two or more adults are there, never named or shown; friends who follow
 *    each other with you count as the faces you already see; a teen is
 *    never counted, and a teen sees no one else's count.
 *
 *    Lighting up while standing at a court (within SAME_COURT_MILES of its
 *    pin, the map's own same-court rule) also says "I'm playing here" there:
 *    the same tap, never on its own. Not for a teen, a club's court or
 *    someone's home court (canCheckIn, the server's own rule too). Turn off
 *    takes both away (checkOutOfMap; the server drops both).
 *
 * Turned on for everyone by setting the switch to true and shipping an
 * over-the-air update: no database change, no new native code. In the web
 * demo, ?admin=1 makes the demo's player an admin.
 */
export const LIGHT_UP_COURTS_FOR_EVERYONE = false;

/** Whether courts light up for this person: everyone once released, admins until then. */
export const lightUpCourtsOn = (me: User | null | undefined): boolean => LIGHT_UP_COURTS_FOR_EVERYONE || !!me?.isAdmin;

/** The same, for a screen. */
export function useLightUpCourts(): boolean {
  const { currentUser } = useApp();
  return lightUpCourtsOn(currentUser);
}

/* ------------------------------------------------------------- the words */

/** The button, before a tap. */
export const LIGHT_UP = 'Light up';
/** How long a light-up made now lasts: "till 10pm", or "for 2 hours" late in the day (checkInEnds). */
export const litSpan = (now: Date = new Date()): string => (now.getHours() >= 20 ? 'for 2 hours' : `till ${clock(checkInEnds(now))}`);
/** Until when yours shows: "till 10pm". */
export const litTill = (until: string): string => `till ${clock(new Date(until))}`;
/** The Find Players card's button while you are lit up: "Lit · 10pm". */
export const litShort = (until: string): string => `Lit · ${clock(new Date(until))}`;
/** The state, said whole: "You’re lit up · till 10pm". */
export const litLine = (span: string): string => `You’re lit up · ${span}`;

/* ---------------------------------------------------- the court you're at */

/** The map's own rule for the same court (features/places/court sameCourt): within 0.15 mi of its pin. */
const SAME_COURT_MILES = 0.15;

/** The court you are standing at: the nearest open one within SAME_COURT_MILES, or null. */
export function courtAt(at: LatLng, courts: Court[]): Court | null {
  let best: Court | null = null;
  let bestMiles = SAME_COURT_MILES;
  for (const c of courts) {
    if (!isMapCourtId(c.id) || isClosedCourt(c)) continue;
    const miles = milesBetween(at, c);
    if (miles < bestMiles) { best = c; bestMiles = miles; }
  }
  return best;
}

/**
 * Lighting up at a court lights the court up too: "I'm playing here" there,
 * from the same tap and the same spot (checkIn: the store's checkInAtCourt).
 * Resolves the court's name when it went through, else null (and nothing
 * more is said: the light-up itself stands either way).
 */
export async function lightUpCourtHere(at: LatLng, a: {
  me: User | null | undefined;
  /** Who may play there, as players said (courtFacts), when the map's own answer is unknown. */
  accessOf: (courtId: string) => CourtAccess | undefined;
  checkIn: (courtId: string, at: LatLng) => Promise<string | null>;
}): Promise<string | null> {
  if (!lightUpCourtsOn(a.me) || !canCheckIn(a.me)) return null;
  const list = peekCourts(at) ?? await Promise.race([
    fetchCourts(at).catch(() => [] as Court[]),
    new Promise<Court[]>((resolve) => { setTimeout(() => resolve([]), 5000); }),
  ]);
  const court = courtAt(at, list);
  if (!court) return null;
  const said = a.accessOf(court.id);
  if (!canCheckIn(a.me, said && said !== 'unknown' ? said : court.access)) return null;
  const problem = await a.checkIn(court.id, at).catch(() => 'failed');
  return problem ? null : court.name && court.name !== 'Tennis courts' ? court.name : 'The court';
}

/* ------------------------------------------------------- the courts' glow */

/** How lit a court is: 1 warm, 2 lit, 3 hot. */
export type GlowLevel = 1 | 2 | 3;
/** A court with something on right now, as the map draws it. */
export interface CourtGlow {
  level: GlowLevel;
  /** "4 here", "You + 2 here", "You’re here", "Hit 6pm", "2 hits today". */
  label: string;
  court: Court;
}

/** Quiet (0), warm (1), lit (2 or 3), hot (4 or more). */
export const glowLevel = (score: number): GlowLevel | 0 => (score >= 4 ? 3 : score >= 2 ? 2 : score >= 1 ? 1 : 0);

/** Whether an hour is later today on this phone's clock (an open hit still to come, or under way). */
const today = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

/**
 * What is on at each court, from what the app may already show: the server's
 * count of who is playing there (court_right_now: strangers only from two up),
 * friends who follow each other with you at it (named there already), you,
 * and the open hits there today that you may see.
 */
export function courtGlows({ courts, courtNow, hits, shown, me, playingAt, now = new Date() }: {
  courts: Court[];
  courtNow: Record<string, CourtRightNow>;
  hits: MapModel['hits'];
  shown: Placed[];
  me: ID | null;
  /** Your live session's court, while you are playing there. */
  playingAt?: string | null;
  now?: Date;
}): Map<string, CourtGlow> {
  const friendsAt = new Map<string, Set<ID>>();
  for (const p of shown) {
    if (!p.court || p.user.id === me) continue;
    const set = friendsAt.get(p.court.id) ?? new Set<ID>();
    set.add(p.user.id);
    friendsAt.set(p.court.id, set);
  }
  const hitsAt = new Map<string, string[]>();
  for (const h of hits) {
    const id = h.hit.place.id;
    if (!id || !today(h.hit.startsAt, now)) continue;
    hitsAt.set(id, [...(hitsAt.get(id) ?? []), h.hit.startsAt]);
  }
  const out = new Map<string, CourtGlow>();
  for (const c of courts) {
    if (out.has(c.id)) continue;
    const row = courtNow[c.id];
    const friends = new Set<ID>([...(row?.friendIds ?? []), ...(friendsAt.get(c.id) ?? [])]);
    if (me) friends.delete(me);
    const others = Math.max(row?.playing ?? 0, friends.size);
    const you = !!row?.youHere || playingAt === c.id;
    const people = others + (you ? 1 : 0);
    const times = (hitsAt.get(c.id) ?? []).sort();
    const level = glowLevel(people + times.length);
    if (!level) continue;
    const label = people
      ? you ? (others ? `You + ${others} here` : 'You’re here') : `${people} here`
      : times.length > 1 ? `${times.length} hits today` : `Hit ${hitShort(times[0], now).replace(/^Today /, '')}`;
    out.set(c.id, { level, label, court: c });
  }
  return out;
}

/** At most this many courts are asked about at once (court_right_now takes 50). */
const ASK_MAX = 50;
/** How often a map left open asks again. */
const REFRESH_MS = 3 * 60_000;

/** The courts nearest the middle of a list (where the map came to rest), at most ASK_MAX, as one key. */
function nearestKey(courts: Court[]): string {
  const real = courts.filter((c) => isMapCourtId(c.id));
  if (!real.length) return '';
  const mid = { lat: real.reduce((s, c) => s + c.lat, 0) / real.length, lng: real.reduce((s, c) => s + c.lng, 0) / real.length };
  return real.map((c) => ({ id: c.id, d: milesBetween(mid, c) })).sort((a, b) => a.d - b.d).slice(0, ASK_MAX).map((c) => c.id).sort().join(',');
}

/**
 * The glow of the courts on a map (the card's courts around your town, or the
 * full map's pins), asking the server how each is right now as the map comes
 * to rest and every few minutes while it stays open. Null while courts do not
 * light up for you (the map then looks exactly as before).
 */
export function useCourtGlow(model: MapModel, expanded: boolean, shown: Placed[], playingAt?: string | null): Map<string, CourtGlow> | null {
  const on = useLightUpCourts();
  const { courtNow, actions, currentUserId } = useApp();
  const pool = expanded ? model.courts : model.cardPool;
  const key = useMemo(() => (on ? nearestKey(pool) : ''), [on, pool]);
  const { loadCourtsNow } = actions;
  useEffect(() => {
    if (!key) return undefined;
    const ids = key.split(',');
    void loadCourtsNow(ids);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void loadCourtsNow(ids); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, loadCourtsNow]);
  return useMemo(
    () => (on ? courtGlows({ courts: pool, courtNow, hits: model.hits, shown, me: currentUserId, playingAt }) : null),
    [on, pool, courtNow, model.hits, shown, currentUserId, playingAt],
  );
}

/** One short key for a glow map, for a memo's list (the pins redraw only when a court's glow changes). */
export const glowKey = (glow: Map<string, CourtGlow> | null): string =>
  (glow ? [...glow].map(([id, g]) => `${id}:${g.level}:${g.label}`).join('|') : '');
