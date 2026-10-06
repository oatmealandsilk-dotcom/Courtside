import type { CourtFacts, CourtFollowCount, CourtReview, CourtRightNow, CourtRing, FollowedCourt, HitRequest, ID, Notification, Post, TaggedCourt, User } from '../types';
import { notKnownAdult } from '@/features/players/age';
import { isMapCourtId } from '@/features/places/courtName';
import { DEMO_PARK } from './courts';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's stand-ins for migration 60, so every court feature shows in
 * the web demo (?as=you) without a database: what players said about two
 * parks, how they are right now, who follows them, and the people the demo
 * player follows. The functions below work out court rings, "who you follow
 * plays here" and "Your courts" from the demo's own posts and hits, by the
 * same rules the server's functions use. Only the demo uses any of this.
 */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const park = (n: number): TaggedCourt => { const c = DEMO_PARK(n); return { id: c.id, name: c.name ?? 'Public courts', lat: c.lat, lng: c.lng }; };

/**
 * The demo player follows Sam and Marcus, so the Following chip and "who
 * you follow plays here" have someone to show, and Omar, who follows back
 * (his pin is exact on the map, presence.ts). And Tomás, Nadia and June,
 * who are on streaks, so the weekly recap's "Friends on a streak" has a
 * board (none of the three shares a spot on the map).
 */
export const DEMO_FOLLOWING: ID[] = ['u-sam', 'u-marcus', 'u-omar', 'u-tomas', 'u-nadia', 'u-june'];

/**
 * Some of the people who follow the demo player, so Followers has someone in
 * it under "184 followers" rather than "No followers yet": Omar (who follows
 * back) and five more adults. None of them has a post in the demo feed, so
 * the feed's order is as it was.
 */
export const DEMO_FOLLOWERS: ID[] = ['u-omar', 'u-rosa', 'u-kai', 'u-noor', 'u-theo', 'u-lena'];

const blankFacts = (courtId: string): CourtFacts => ({
  courtId, access: 'unknown', players: 0, lights: { yes: 0, no: 0 }, nets: { good: 0, bad: 0 }, surface: { good: 0, cracked: 0, wetProne: 0 }, busy: {}, busyAnswers: 0, busyNever: 0, notes: [],
});

/** What players said: three about Alder Park (lit, busy weekday evenings, some cracks), two about Cypress Hollow. */
export const DEMO_FACTS: Record<string, CourtFacts> = {
  [park(1).id]: {
    ...blankFacts(park(1).id), access: 'public', accessBy: 'map', players: 3,
    lights: { yes: 3, no: 0 }, nets: { good: 2, bad: 1 }, surface: { good: 1, cracked: 2, wetProne: 0 },
    busy: { 'weekday-evening': 3, 'weekend-morning': 2 }, busyAnswers: 3,
    notes: [{ text: 'Lights go off at 10. Two-set limit when people are waiting.', on: daysAgo(2) }],
    updatedAt: minutesAgo(60 * 30),
  },
  [park(3).id]: {
    ...blankFacts(park(3).id), access: 'public', accessBy: 'players', players: 2,
    lights: { yes: 2, no: 0 }, nets: { good: 2, bad: 0 }, surface: { good: 1, cracked: 0, wetProne: 1 },
    busy: { 'weekend-morning': 2 }, busyAnswers: 2,
    notes: [{ text: 'Courts 5 and 6 hold puddles after rain.', on: daysAgo(5) }],
    updatedAt: minutesAgo(60 * 100),
  },
};
export const demoFactsFor = (courtId: string): CourtFacts => DEMO_FACTS[courtId] ?? blankFacts(courtId);

/** Right now: Alder Park is free and three adults are playing (Sam among them); Cypress Hollow has a wait. */
export const DEMO_NOW: Record<string, CourtRightNow> = {
  [park(1).id]: { courtId: park(1).id, status: 'free', statusAt: minutesAgo(20), playing: 3, friendIds: ['u-sam'], youHere: false },
  [park(3).id]: { courtId: park(3).id, status: 'wait', statusAt: minutesAgo(45), playing: 0, friendIds: [], youHere: false },
};
export const demoNowFor = (courtId: string): CourtRightNow => DEMO_NOW[courtId] ?? { courtId, playing: 0, friendIds: [], youHere: false };

/** Who follows each park (a count only), and the two the demo player follows. */
export const DEMO_FOLLOWS: Record<string, CourtFollowCount> = {
  [park(1).id]: { courtId: park(1).id, followers: 6, following: true },
  [park(3).id]: { courtId: park(3).id, followers: 4, following: true },
  [park(5).id]: { courtId: park(5).id, followers: 1, following: false },
};
export const demoFollowsFor = (courtId: string): CourtFollowCount => DEMO_FOLLOWS[courtId] ?? { courtId, followers: 0, following: false };
/** Where each followed park is, for "Your courts". */
export const DEMO_FOLLOWED_AT: Record<string, TaggedCourt & { at: string }> = {
  [park(1).id]: { ...park(1), at: minutesAgo(60 * 24 * 9) },
  [park(3).id]: { ...park(3), at: minutesAgo(60 * 24 * 4) },
};

/** Two of the new alerts in the demo's Notifications: Sam is up for a hit, and a new clip at a court you follow. */
export const DEMO_MAP_ALERTS: Notification[] = [
  { id: 'n-map-1', userId: CURRENT_USER_ID, actorId: 'u-sam', kind: 'map-friend-hit', targetId: 'u-sam', targetKind: 'profile', createdAt: minutesAgo(35), read: false, preview: '1 mi from you' },
  { id: 'n-map-2', userId: CURRENT_USER_ID, actorId: 'u-sam', kind: 'court-activity', targetId: park(1).id, targetKind: 'court', createdAt: minutesAgo(60 * 5), read: true, preview: `New clip at ${park(1).name}` },
];

/** Who the demo player is to everyone else, for the rules below. */
export interface Seeing { me: ID | null; users: User[]; followingIds: ID[]; blockedIds: ID[]; mutedIds: ID[] }

/**
 * The server's shows_at_court, as the demo can tell it: never someone
 * blocked or muted, a private account only for its followers, and someone
 * not known to be an adult only for people who follow them.
 */
function showsAtCourt(authorId: ID, s: Seeing): boolean {
  if (authorId === s.me) return true;
  if (s.blockedIds.includes(authorId) || s.mutedIds.includes(authorId)) return false;
  const author = s.users.find((u) => u.id === authorId);
  if (!author) return false;
  const following = s.followingIds.includes(authorId);
  if (author.isPrivate && !following) return false;
  return !notKnownAdult(author) || following;
}

const WEEK = 7 * 86_400_000;

/** Court rings in a box: tagged courts with a post or an open hit in the last 7 days that you may see (court_rings). */
export function demoRings(posts: Post[], hits: HitRequest[], s: Seeing, box: { minLat: number; minLng: number; maxLat: number; maxLng: number }): CourtRing[] {
  const since = Date.now() - WEEK;
  const per = new Map<string, CourtRing>();
  const add = (court: TaggedCourt, post: boolean, at: string) => {
    const had = per.get(court.id) ?? { courtId: court.id, name: court.name, lat: court.lat, lng: court.lng, posts: 0, hits: 0, lastAt: at };
    if (post) had.posts += 1; else had.hits += 1;
    if (at > had.lastAt) had.lastAt = at;
    per.set(court.id, had);
  };
  for (const p of posts) {
    if (p.court && isMapCourtId(p.court.id) && !p.archived && Date.parse(p.createdAt) > since && showsAtCourt(p.authorId, s)) add(p.court, true, p.createdAt);
  }
  for (const h of hits) {
    const { id, lat, lng } = h.place;
    if (isMapCourtId(id) && typeof lat === 'number' && typeof lng === 'number' && !h.cancelled && Date.parse(h.createdAt) > since && showsAtCourt(h.authorId, s)) add({ id, name: h.place.name, lat, lng }, false, h.createdAt);
  }
  return [...per.values()]
    .filter((r) => r.lat >= box.minLat && r.lat <= box.maxLat && r.lng >= box.minLng && r.lng <= box.maxLng)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** "Sam and Marcus, who you follow, play here": people you follow who posted, posted a hit or joined one at each court in 90 days (court_people_you_follow). */
export function demoRegulars(courtIds: string[], posts: Post[], hits: HitRequest[], s: Seeing): Record<string, ID[]> {
  const since = Date.now() - 90 * 86_400_000;
  const acts: { court: string; who: ID; at: string }[] = [];
  for (const p of posts) if (p.court && !p.archived && Date.parse(p.createdAt) > since) acts.push({ court: p.court.id, who: p.authorId, at: p.createdAt });
  for (const h of hits) {
    if (!h.place.id || h.cancelled || Date.parse(h.createdAt) <= since) continue;
    acts.push({ court: h.place.id, who: h.authorId, at: h.createdAt });
    for (const j of h.joinedIds) acts.push({ court: h.place.id, who: j, at: h.createdAt });
  }
  const out: Record<string, ID[]> = {};
  for (const id of courtIds) {
    const latest = new Map<ID, string>();
    for (const a of acts) {
      if (a.court !== id || a.who === s.me || !s.followingIds.includes(a.who) || !showsAtCourt(a.who, s)) continue;
      if (!latest.has(a.who) || a.at > latest.get(a.who)!) latest.set(a.who, a.at);
    }
    out[id] = [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, 5).map(([who]) => who);
  }
  return out;
}

/** "Your courts": each court you follow with others' posts this week, open hits coming up and the latest answer (my_courts). */
export function demoMyCourts(followed: (TaggedCourt & { at: string; access?: FollowedCourt['access'] })[], posts: Post[], hits: HitRequest[], now: Record<string, CourtRightNow>, s: Seeing): FollowedCourt[] {
  const since = Date.now() - WEEK;
  return followed.map((c) => {
    const here = posts.filter((p) => p.court?.id === c.id && !p.archived && p.authorId !== s.me && Date.parse(p.createdAt) > since && showsAtCourt(p.authorId, s));
    const ahead = hits.filter((h) => h.place.id === c.id && !h.cancelled && h.authorId !== s.me && Date.parse(h.startsAt) > Date.now() && showsAtCourt(h.authorId, s))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const right = now[c.id];
    const last = [...here.map((p) => p.createdAt), ...ahead.map((h) => h.createdAt)].sort().pop();
    return {
      courtId: c.id, name: c.name, lat: c.lat, lng: c.lng, access: c.access ?? 'unknown', followedAt: c.at,
      newPosts: here.length, upcomingHits: ahead.length, ...(ahead[0] ? { nextHitAt: ahead[0].startsAt } : {}),
      ...(right?.status ? { status: right.status, statusAt: right.statusAt } : {}), ...(last ? { lastAt: last } : {}),
      ...(right?.youHere ? { youHere: true } : {}),
    };
  }).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || b.followedAt.localeCompare(a.followedAt));
}

/**
 * Your facts laid onto everyone's, the way the server's totals would move
 * when you save: your old answer taken out, the new one put in. Notes from
 * the demo player are adult notes, so yours shows at the top.
 */
export function withReview(facts: CourtFacts, before: CourtReview | undefined, after: CourtReview | null): CourtFacts {
  const f: CourtFacts = JSON.parse(JSON.stringify(facts));
  const apply = (r: CourtReview, k: 1 | -1) => {
    f.players += k;
    if (r.lights !== undefined) { if (r.lights) f.lights.yes += k; else f.lights.no += k; }
    if (r.nets) f.nets[r.nets] += k;
    if (r.surface) f.surface[r.surface === 'wet-prone' ? 'wetProne' : r.surface] += k;
    if (r.busy) { f.busyAnswers += k; if (!r.busy.length) f.busyNever += k; for (const part of r.busy) f.busy[part] = Math.max(0, (f.busy[part] ?? 0) + k); }
    if (r.notes) f.notes = k > 0 ? [{ text: r.notes, on: new Date().toISOString().slice(0, 10) }, ...f.notes].slice(0, 3) : f.notes.filter((n) => n.text !== r.notes);
  };
  if (before) apply(before, -1);
  if (after) apply(after, 1);
  // Players' word on who may play, when nothing firmer said it. As on the
  // server, one player alone never closes a court the map says anyone may play at.
  const closing = after?.access === 'members' || after?.access === 'private';
  const mapOpen = f.accessBy === 'map' && (f.access === 'public' || f.access === 'pay');
  if (after?.access && f.accessBy !== 'admin' && !(closing && mapOpen)) { f.access = after.access; f.accessBy = 'players'; }
  f.updatedAt = new Date().toISOString();
  return f;
}
