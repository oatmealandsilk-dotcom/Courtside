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
 * 1. The words, for everyone (Oct 27, the owner's pick: "Up to hit"): the
 *    button that shares your spot with friends says "Up to hit"; while on,
 *    "Up to hit · till 10pm" (on the Find Players card's button and in the
 *    toast; "for 2 hours" late in the day); "Turn off" stops it. What
 *    it does is unchanged (migration 189): one tap, read once, friends who
 *    follow each other with you, until 10pm, never on its own.
 *
 * 2. Courts light up (LIGHT_UP_COURTS_FOR_EVERYONE, admins first): on the
 *    full map (phone and browser alike: the pins are the same HTML in both,
 *    markers.ts), a court glows by how much is on
 *    there right now: people playing there ("I'm playing here", which Up to
 *    hit at a court now says too) and open hits there today. Quiet as ever
 *    with nothing on; warm (1), lit (2 or 3), hot (4 or more). Oct 27 review
 *    (owner: "way more noticble ... the courts can be bigger ... a live
 *    gradient that flahes and animates ... really eye catching"): a lit court
 *    is a big tile (2 to 3 times a quiet one, bigger each level) with a ring
 *    of the theme's colours travelling round it, a sheen sweeping across, and
 *    a soft glow breathing behind; hot courts move fastest (markers.ts
 *    litCourtPinHtml). Oct 28 (owner: "give me a couple to pick
 *    from"): three looks, A floodlit court, B story ring, C raised pin
 *    (markers.ts LIT_LOOK). Who is there shows on it, in place of their own
 *    pins beside it (pinList): one or two people, their circles and no
 *    number; three or more, two circles then "+5" ("anything more, should
 *    show the icon and then +x never just person emoji with the number").
 *    Friends who follow each other with you show as their faces; a
 *    stranger only ever as a plain disc, the same for everyone (no face,
 *    no initials, no name: Apple 5.1.2(i)).
 *    Only counts, as the server already gives
 *    them (court_right_now, migration 189): a stranger is counted only once
 *    two or more adults are there, never named or shown (no face, no pin:
 *    only a plain disc and the "+5"); a teen is never counted, and a teen sees no one else's
 *    count.
 *
 *    Tapping Up to hit while standing at a court (within SAME_COURT_MILES of its
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
export const LIGHT_UP = 'Up to hit';
/** How long Up to hit tapped now lasts: "till 10pm", or "for 2 hours" late in the day (checkInEnds). */
export const litSpan = (now: Date = new Date()): string => (now.getHours() >= 20 ? 'for 2 hours' : `till ${clock(checkInEnds(now))}`);
/** Until when yours shows: "till 10pm". */
export const litTill = (until: string): string => `till ${clock(new Date(until))}`;
/** The state, said whole (the owner's words): "Up to hit · till 10pm", on the card's button and in the toast. */
export const litLine = (span: string): string => `Up to hit · ${span}`;

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
  /** "4 here", "You + 2 here", "You’re here", "Playing now" (one or two: their circles say who), "Hit 6pm", "2 hits today". */
  label: string;
  court: Court;
  /** How many people are there now, you included (strangers only as the server counts them). */
  people: number;
  /** You are there (said "I'm playing here", or playing a live session there). */
  you: boolean;
  /**
   * Friends who follow each other with you, there now, most recently seen first: the only faces a
   * court may wear (on its corner, pinList). Never a stranger, never someone who only follows you.
   */
  friends: User[];
  /** Its light moves (the liveliest LIVE_MAX courts); the rest glow, still. */
  live: boolean;
}

/**
 * At most this many lit courts move at once (their ring travelling, their sheen and glow): the liveliest,
 * hot first. The rest wear the same gradient, still, so a busy city never has dozens of pins animating.
 * Only pins in or near the view are ever made (pinEngine), so these are the ones on screen.
 */
export const LIVE_MAX = 6;

/** Quiet (0), warm (1), lit (2 or 3), hot (4 or more). */
export const glowLevel = (score: number): GlowLevel | 0 => (score >= 4 ? 3 : score >= 2 ? 2 : score >= 1 ? 1 : 0);

/** Standing on a court: within about 20 m of its pin (the same as pinList's ON_COURT_MILES). */
const ON_COURT_MILES = 0.0125;

/** The court an exact spot stands on (the nearest within ON_COURT_MILES), as pinList's courtUnder finds it. */
function standingOn(at: LatLng, courts: Court[]): string | undefined {
  let best: string | undefined;
  let bestMiles = ON_COURT_MILES;
  for (const c of courts) {
    const miles = milesBetween(at, c);
    if (miles < bestMiles) { bestMiles = miles; best = c.id; }
  }
  return best;
}

/** Whether an hour is later today on this phone's clock (an open hit still to come, or under way). */
const today = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

/**
 * What is on at each court, from what the app may already show: the server's
 * count of who is playing there (court_right_now: strangers only from two up),
 * friends who follow each other with you at it (named there already), you,
 * and the open hits there today that you may see.
 */
export function courtGlows({ courts, courtNow, hits, shown, me, playingAt, users = [], now = new Date() }: {
  courts: Court[];
  courtNow: Record<string, CourtRightNow>;
  hits: MapModel['hits'];
  shown: Placed[];
  me: ID | null;
  /** Your live session's court, while you are playing there. */
  playingAt?: string | null;
  /** Everyone the app knows, for the faces of friends the server says are there but the map's filter left out. */
  users?: User[];
  now?: Date;
}): Map<string, CourtGlow> {
  // Who the map places at each court (checked in there): everyone counts; only friends who follow each other with you may wear a face.
  const placedAt = new Map<string, Set<ID>>();
  const faceAt = new Map<string, Placed[]>();
  for (const p of shown) {
    if (p.user.id === me) continue;
    // Checked in there, or placed exactly and standing on it (pinList's courtUnder: a rough spot never puts anyone at a court).
    const at = p.court?.id ?? (p.rough ? undefined : standingOn(p.at, courts));
    if (!at) continue;
    const set = placedAt.get(at) ?? new Set<ID>();
    set.add(p.user.id);
    placedAt.set(at, set);
    if (p.mutual) faceAt.set(at, [...(faceAt.get(at) ?? []), p]);
  }
  const hitsAt = new Map<string, string[]>();
  for (const h of hits) {
    const id = h.hit.place.id;
    if (!id || !today(h.hit.startsAt, now)) continue;
    hitsAt.set(id, [...(hitsAt.get(id) ?? []), h.hit.startsAt]);
  }
  const byId = new Map(users.map((u) => [u.id, u] as const));
  const out = new Map<string, CourtGlow>();
  const score = new Map<string, number>();
  for (const c of courts) {
    if (out.has(c.id)) continue;
    const row = courtNow[c.id];
    const friendIds = new Set<ID>(row?.friendIds ?? []);
    if (me) friendIds.delete(me);
    const placed = placedAt.get(c.id) ?? new Set<ID>();
    const others = Math.max(row?.playing ?? 0, new Set<ID>([...friendIds, ...placed]).size);
    const you = !!row?.youHere || playingAt === c.id;
    const people = others + (you ? 1 : 0);
    const times = (hitsAt.get(c.id) ?? []).sort();
    const level = glowLevel(people + times.length);
    if (!level) continue;
    // One or two people: their circles on the court say who and how many, so its words carry no number
    // (Oct 28, owner: "if its 2 or less ppl hitting there. the icons of them should show up instead of it
    // just saying 2ppl"); three or more: the count.
    const label = people
      ? people <= 2 ? (you ? 'You’re here' : 'Playing now') : you ? `You + ${others} here` : `${people} here`
      : times.length > 1 ? `${times.length} hits today` : `Hit ${hitShort(times[0], now).replace(/^Today /, '')}`;
    // Faces: friends the map places here (most recently seen first), then friends only the server names here.
    const seen = (faceAt.get(c.id) ?? []).slice().sort((a, b) => (Date.parse(b.seenAt ?? '') || 0) - (Date.parse(a.seenAt ?? '') || 0)).map((p) => p.user);
    const extra = [...friendIds].filter((id) => !seen.some((u) => u.id === id)).map((id) => byId.get(id)).filter((u): u is User => !!u);
    out.set(c.id, { level, label, court: c, people, you, friends: [...seen, ...extra], live: false });
    score.set(c.id, level * 1000 + people * 10 + times.length);
  }
  // The liveliest few move; the rest stay still (LIVE_MAX).
  [...out.keys()].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0)).slice(0, LIVE_MAX).forEach((id) => { out.get(id)!.live = true; });
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
 * The glow of the full map's court pins, asking the server how each is right
 * now as the map comes to rest and every few minutes while it stays open. Null
 * on the still Find Players card and while courts do not light up for you (the
 * map then looks exactly as before). Not on the card: at its zoom a town's
 * courts sit round its name and lines in the middle, so lit badges there piled
 * onto the words and the faces (Oct 27 review); and the card shows people and
 * hits only, courts live on the full map (Oct 3, owner).
 */
export function useCourtGlow(model: MapModel, expanded: boolean, shown: Placed[], playingAt?: string | null): Map<string, CourtGlow> | null {
  const on = useLightUpCourts() && expanded;
  const { courtNow, actions, currentUserId, users } = useApp();
  const pool = model.courts;
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
    () => (on ? courtGlows({ courts: pool, courtNow, hits: model.hits, shown, me: currentUserId, playingAt, users }) : null),
    [on, pool, courtNow, model.hits, shown, currentUserId, playingAt, users],
  );
}

/** One short key for a glow map, for a memo's list (the pins redraw only when a court's glow changes). */
export const glowKey = (glow: Map<string, CourtGlow> | null): string =>
  (glow ? [...glow].map(([id, g]) => `${id}:${g.level}:${g.label}:${g.live ? 1 : 0}:${g.friends.map((u) => `${u.id}${u.avatarUrl ?? ''}`).join(',')}`).join('|') : '');
