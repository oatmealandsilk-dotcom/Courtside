import { useCallback, useMemo } from 'react';

import { remote } from '@/data/remote';
import { DEMO_FOLLOWED_AT, demoFactsFor, demoFollowsFor, demoMyCourts, demoNowFor, demoRegulars, demoRings, withReview, type Seeing } from '@/data/mock/courtLife';
import type { CourtAccess, CourtFacts, CourtFollowCount, CourtNow, CourtReview, CourtRightNow, CourtRing, FollowedCourt, HitRequest, ID, Post, TaggedCourt, User } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { getPosition } from '@/lib/geo';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';

/*
 * The courts' own life (migration 60), as one slice of the app's state:
 * what players say about each court, who follows it, how it is right now,
 * the people you follow who play there, the map's court rings, and your
 * own courts. The state lives in AppContext with everything else; the
 * actions are written here so that file does not grow by another few
 * hundred lines. With a database each one asks the server; the demo works
 * the same answers out from its own posts and hits (data/mock/courtLife).
 */

export interface CourtLifeState {
  /** Everyone's facts about the courts opened, added up, by court id. */
  courtFacts: Record<string, CourtFacts>;
  /** "6 players follow this court", and whether you do, by court id. */
  courtFollows: Record<string, CourtFollowCount>;
  /** Right now at the courts opened, by court id. */
  courtNow: Record<string, CourtRightNow>;
  /** The people you follow who play at each court opened ("Sam and Dev play here"). */
  courtRegulars: Record<string, ID[]>;
  /** Courts with a post or hit this week, around where the map looked. */
  courtRings: CourtRing[];
  /** Your own facts about courts, to fill "Add what you know" back in. */
  myCourtReviews: Record<string, CourtReview>;
  /** The courts you follow, with what is new at each; null until first asked. */
  followedCourts: FollowedCourt[] | null;
  /**
   * Whether the database has the courts' features: null until a read says,
   * false on a database without migration 60, where the app hides them
   * rather than offering buttons that cannot work.
   */
  courtExtras: boolean | null;
}

export const emptyCourtLife: CourtLifeState = {
  courtFacts: {}, courtFollows: {}, courtNow: {}, courtRegulars: {}, courtRings: [], myCourtReviews: {}, followedCourts: null, courtExtras: null,
};

/** What the slice reads from the rest of the app's state. */
interface Reads {
  currentUserId: ID | null; users: User[]; posts: Post[]; hitRequests: HitRequest[]; followingIds: ID[]; blockedIds: ID[]; mutedIds: ID[]; locationEnabled: boolean;
  /** Where the phone was last found, and that town's name; a check-in refreshes the first. */
  detectedCoords: { lat: number; lng: number } | null; detectedLocation: string | null;
}

/** A court to follow, with where it is, so "Your courts" can show it at once. */
export type CourtToFollow = TaggedCourt & { access?: CourtAccess };

/** A box of the map, for court rings. */
export interface MapBox { minLat: number; minLng: number; maxLat: number; maxLng: number }

export interface CourtLifeActions {
  /** Facts, follows, right now and "who you follow plays here" for some courts (a card or page opening). */
  loadCourtInfo: (courtIds: string[]) => Promise<void>;
  /** Your own facts about a court, for the sheet to start from. */
  loadMyCourtReview: (courtId: string) => Promise<CourtReview | null>;
  /** Saves your facts about a court, replacing any earlier ones. Throws a plain sentence when it cannot. */
  saveCourtReview: (review: CourtReview) => Promise<void>;
  /** The heart on a court's card and page. */
  toggleCourtFollow: (court: CourtToFollow) => void;
  /** "Your courts" on Find Players. */
  loadFollowedCourts: () => Promise<void>;
  /** "How is it right now?" Null takes your answer back. Resolves a sentence when it did not go through. */
  reportCourtNow: (courtId: string, status: CourtNow | null) => Promise<string | null>;
  /** "I'm playing here", for two hours. Resolves a sentence when it is refused. */
  checkInAtCourt: (courtId: string) => Promise<string | null>;
  checkOutOfCourt: () => Promise<void>;
  /** Court rings in a box of the map. */
  loadCourtRings: (box: MapBox) => Promise<void>;
}

const seeing = (s: Reads): Seeing => ({ me: s.currentUserId, users: s.users, followingIds: s.followingIds, blockedIds: s.blockedIds, mutedIds: s.mutedIds });
const byCourt = <T extends { courtId: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.courtId, r]));
/** Nothing said in a review: the sheet needs at least one answer. */
const saysNothing = (r: CourtReview) => r.lights === undefined && !r.nets && !r.surface && !r.busy && !r.access && !r.notes?.trim();

export function useCourtLife<S extends CourtLifeState & Reads>(
  stateRef: { current: S },
  setState: (update: (prev: S) => S) => void,
  live: (...ids: (ID | null | undefined)[]) => boolean,
): CourtLifeActions {
  const loadCourtInfo = useCallback(async (courtIds: string[]) => {
    const ids = [...new Set(courtIds.filter(isMapCourtId))].slice(0, 50);
    const me = stateRef.current.currentUserId;
    if (!ids.length || !me) return;
    if (!live(me)) {
      // The demo: its answers for courts not yet seen; anything changed here (a follow, an answer) stays.
      const s = stateRef.current;
      const regulars = demoRegulars(ids, s.posts, s.hitRequests, seeing(s));
      setState((prev) => ({
        ...prev,
        courtExtras: true,
        courtFacts: { ...Object.fromEntries(ids.map((id) => [id, demoFactsFor(id)])), ...prev.courtFacts },
        courtFollows: { ...Object.fromEntries(ids.map((id) => [id, demoFollowsFor(id)])), ...prev.courtFollows },
        courtNow: { ...Object.fromEntries(ids.map((id) => [id, demoNowFor(id)])), ...prev.courtNow },
        courtRegulars: { ...prev.courtRegulars, ...regulars },
      }));
      return;
    }
    const [facts, follows, now, regulars] = await Promise.all([
      remote.fetchCourtFacts(ids).catch(() => null),
      remote.fetchCourtFollowCounts(ids).catch(() => null),
      remote.fetchCourtRightNow(ids).catch(() => null),
      remote.fetchCourtRegulars(ids).catch(() => null),
    ]);
    if (stateRef.current.currentUserId !== me) return;
    const any = !!(facts || follows || now || regulars);
    setState((prev) => ({
      ...prev,
      // All four missing: a database without migration 60, so its buttons stay hidden.
      courtExtras: any ? true : prev.courtExtras ?? false,
      courtFacts: facts ? { ...prev.courtFacts, ...byCourt(facts) } : prev.courtFacts,
      courtFollows: follows ? { ...prev.courtFollows, ...byCourt(follows) } : prev.courtFollows,
      courtNow: now ? { ...prev.courtNow, ...byCourt(now) } : prev.courtNow,
      courtRegulars: regulars ? { ...prev.courtRegulars, ...Object.fromEntries(ids.map((id) => [id, regulars.find((r) => r.courtId === id)?.userIds ?? []])) } : prev.courtRegulars,
    }));
  }, [stateRef, setState, live]);

  const loadMyCourtReview = useCallback(async (courtId: string) => {
    const me = stateRef.current.currentUserId;
    if (!me || !isMapCourtId(courtId)) return null;
    if (!live(me)) return stateRef.current.myCourtReviews[courtId] ?? null;
    const mine = await remote.fetchMyCourtReview(me, courtId).catch(() => null);
    if (mine && stateRef.current.currentUserId === me) setState((prev) => ({ ...prev, myCourtReviews: { ...prev.myCourtReviews, [courtId]: mine } }));
    return mine;
  }, [stateRef, setState, live]);

  const saveCourtReview = useCallback(async (review: CourtReview) => {
    const me = stateRef.current.currentUserId;
    if (!me) throw new Error('Sign in to add what you know.');
    if (!isMapCourtId(review.courtId)) throw new Error('This place isn’t on the map, so it can’t take facts yet.');
    if (saysNothing(review)) throw new Error('Pick anything above first.');
    const clean: CourtReview = { ...review, notes: review.notes?.trim().slice(0, 280) || undefined, updatedAt: new Date().toISOString() };
    if (live(me)) {
      await remote.saveCourtReview(me, clean);
      haptics.commit();
      setState((prev) => ({ ...prev, myCourtReviews: { ...prev.myCourtReviews, [clean.courtId]: clean } }));
      // The totals as the server now adds them up.
      await loadCourtInfo([clean.courtId]);
      return;
    }
    haptics.commit();
    setState((prev) => ({
      ...prev,
      myCourtReviews: { ...prev.myCourtReviews, [clean.courtId]: clean },
      courtFacts: { ...prev.courtFacts, [clean.courtId]: withReview(prev.courtFacts[clean.courtId] ?? demoFactsFor(clean.courtId), prev.myCourtReviews[clean.courtId], clean) },
    }));
  }, [stateRef, setState, live, loadCourtInfo]);

  const toggleCourtFollow = useCallback((court: CourtToFollow) => {
    const me = stateRef.current.currentUserId;
    if (!me || !isMapCourtId(court.id)) return;
    const was = stateRef.current.courtFollows[court.id] ?? { courtId: court.id, followers: 0, following: false };
    const next: CourtFollowCount = { courtId: court.id, following: !was.following, followers: Math.max(0, was.followers + (was.following ? -1 : 1)) };
    const entry: FollowedCourt = { courtId: court.id, name: court.name, lat: court.lat, lng: court.lng, access: court.access ?? 'unknown', followedAt: new Date().toISOString(), newPosts: 0, upcomingHits: 0 };
    const put = (row: CourtFollowCount) => setState((prev) => ({
      ...prev,
      courtFollows: { ...prev.courtFollows, [court.id]: row },
      followedCourts: prev.followedCourts === null ? null
        : row.following ? (prev.followedCourts.some((c) => c.courtId === court.id) ? prev.followedCourts : [entry, ...prev.followedCourts])
          : prev.followedCourts.filter((c) => c.courtId !== court.id),
    }));
    haptics.tap();
    put(next);
    showToast({ title: next.following ? `Following ${court.name}` : `Unfollowed ${court.name}`, body: next.following ? 'New hits and clips here show in Your courts.' : undefined, icon: next.following ? 'heart' : 'heart-outline' });
    if (!live(me)) return;
    void (async () => {
      const problem = next.following ? await remote.followCourt(me, court.id) : ((await remote.unfollowCourt(me, court.id)) ? null : 'That didn’t go through. Try again.');
      if (!problem || stateRef.current.currentUserId !== me) return;
      put(was);
      showToast({ title: problem, icon: 'alert-circle-outline' });
    })();
  }, [stateRef, setState, live]);

  const loadFollowedCourts = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    if (!live(me)) {
      const s = stateRef.current;
      // Your followed courts as they stand here (the demo's two to begin with), with what is new at each worked out afresh.
      const kept = s.followedCourts ?? Object.values(DEMO_FOLLOWED_AT).map((c) => ({ courtId: c.id, name: c.name, lat: c.lat, lng: c.lng, access: 'unknown' as const, followedAt: c.at, newPosts: 0, upcomingHits: 0 }));
      const now = { ...Object.fromEntries(kept.map((c) => [c.courtId, demoNowFor(c.courtId)])), ...s.courtNow };
      const list = demoMyCourts(kept.map((c) => ({ id: c.courtId, name: c.name ?? 'Tennis courts', lat: c.lat, lng: c.lng, at: c.followedAt, access: s.courtFacts[c.courtId]?.access ?? demoFactsFor(c.courtId).access })), s.posts, s.hitRequests, now, seeing(s));
      setState((prev) => ({ ...prev, courtExtras: true, followedCourts: list, courtNow: now, courtFollows: { ...Object.fromEntries(list.map((c) => [c.courtId, demoFollowsFor(c.courtId)])), ...prev.courtFollows } }));
      return;
    }
    const list = await remote.fetchMyCourts().catch(() => null);
    if (stateRef.current.currentUserId !== me) return;
    setState((prev) => ({
      ...prev,
      courtExtras: list ? true : prev.courtExtras ?? false,
      followedCourts: list ?? prev.followedCourts ?? [],
      // Whether you are checked in at each, as the server now says, for the courts' cards too.
      courtNow: list ? { ...prev.courtNow, ...Object.fromEntries(list.filter((c) => prev.courtNow[c.courtId]).map((c) => [c.courtId, { ...prev.courtNow[c.courtId], youHere: !!c.youHere }])) } : prev.courtNow,
      // Each one you follow is, plainly, followed by you.
      courtFollows: list ? { ...prev.courtFollows, ...Object.fromEntries(list.map((c) => [c.courtId, { courtId: c.courtId, followers: Math.max(1, prev.courtFollows[c.courtId]?.followers ?? 1), following: true }])) } : prev.courtFollows,
    }));
  }, [stateRef, setState, live]);

  const reportCourtNow = useCallback(async (courtId: string, status: CourtNow | null) => {
    const me = stateRef.current.currentUserId;
    if (!me || !isMapCourtId(courtId)) return 'This place isn’t on the map yet.';
    const was = stateRef.current.courtNow[courtId];
    const at = new Date().toISOString();
    const put = (row: CourtRightNow | undefined) => setState((prev) => ({
      ...prev,
      courtNow: row ? { ...prev.courtNow, [courtId]: row } : prev.courtNow,
      followedCourts: prev.followedCourts?.map((c) => (c.courtId === courtId ? { ...c, status: row?.status, statusAt: row?.statusAt } : c)) ?? null,
    }));
    haptics.commit();
    const base = was ?? { courtId, playing: 0, friendIds: [], youHere: false };
    put(status ? { ...base, status, statusAt: at } : { ...base, status: undefined, statusAt: undefined });
    if (!live(me)) return null;
    const problem = await remote.reportCourtStatus(courtId, status);
    if (problem) { put(was); return problem; }
    // Taking yours back can leave someone else's answer standing: ask again.
    if (!status) void loadCourtInfo([courtId]);
    return null;
  }, [stateRef, setState, live, loadCourtInfo]);

  const checkInAtCourt = useCallback(async (courtId: string) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || !isMapCourtId(courtId)) return 'This place isn’t on the map yet.';
    const self = s.users.find((u) => u.id === me);
    if (!self || notKnownAdult(self)) return 'Checking in is for adults only.';
    if (!s.locationEnabled) return 'Turn on Location first, so players know you’re really here.';
    if (live(me)) {
      // Where the phone is now, not where it was when the app opened: the
      // server checks you are within 5 km of the court, and a spot from this
      // morning at home would say no. The new spot goes up first.
      const fix = await getPosition({ recentMs: 2 * 60_000 });
      if (!fix.ok) return fix.reason === 'denied' ? 'Location is blocked, so we can’t tell you’re here.' : 'Couldn’t find you. Try again.';
      if (stateRef.current.currentUserId !== me) return null;
      setState((prev) => ({ ...prev, detectedCoords: { lat: fix.lat, lng: fix.lng } }));
      await remote.markLastSeen(fix.lat, fix.lng, stateRef.current.detectedLocation ?? undefined);
      const got = await remote.checkInAtCourt(courtId);
      if ('error' in got) {
        return got.error === 'too_far' ? 'You need to be at the court to check in.'
          : got.error === 'location_off' ? 'Turn on Location first, so players know you’re really here.'
            : got.error === 'adults_only' ? 'Checking in is for adults only.'
              : got.error === 'closed_court' ? 'Check-ins are only for courts anyone can play at.'
                : got.error === 'slow_down' ? 'That’s a lot of check-ins today. Try again tomorrow.'
                  : 'That didn’t go through. Try again.';
      }
    }
    haptics.commit();
    // One court at a time: checking in here checks you out anywhere else.
    setState((prev) => ({
      ...prev,
      courtNow: Object.fromEntries([
        ...Object.entries(prev.courtNow).map(([id, row]) => [id, { ...row, youHere: false }] as const),
        [courtId, { ...(prev.courtNow[courtId] ?? { courtId, playing: 0, friendIds: [] }), youHere: true }],
      ]),
      followedCourts: prev.followedCourts?.map((c) => ({ ...c, youHere: c.courtId === courtId })) ?? null,
    }));
    return null;
  }, [stateRef, setState, live]);

  const checkOutOfCourt = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    haptics.tap();
    setState((prev) => ({
      ...prev,
      courtNow: Object.fromEntries(Object.entries(prev.courtNow).map(([id, row]) => [id, { ...row, youHere: false }])),
      followedCourts: prev.followedCourts?.map((c) => ({ ...c, youHere: false })) ?? null,
    }));
    if (live(me)) await remote.checkOutOfCourt();
  }, [stateRef, setState, live]);

  const loadCourtRings = useCallback(async (box: MapBox) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me) return;
    const rings = live(me) ? await remote.fetchCourtRings(box).catch(() => null) : demoRings(s.posts, s.hitRequests, seeing(s), box);
    if (!rings || stateRef.current.currentUserId !== me) return;
    // This box's rings replace the ones it had; rings elsewhere stay for the other map.
    const inBox = (r: CourtRing) => r.lat >= box.minLat && r.lat <= box.maxLat && r.lng >= box.minLng && r.lng <= box.maxLng;
    setState((prev) => ({ ...prev, courtRings: [...prev.courtRings.filter((r) => !inBox(r) && !rings.some((x) => x.courtId === r.courtId)), ...rings].slice(-400) }));
  }, [stateRef, setState, live]);

  return useMemo(() => ({
    loadCourtInfo, loadMyCourtReview, saveCourtReview, toggleCourtFollow, loadFollowedCourts, reportCourtNow, checkInAtCourt, checkOutOfCourt, loadCourtRings,
  }), [loadCourtInfo, loadMyCourtReview, saveCourtReview, toggleCourtFollow, loadFollowedCourts, reportCourtNow, checkInAtCourt, checkOutOfCourt, loadCourtRings]);
}
