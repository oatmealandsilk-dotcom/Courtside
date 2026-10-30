import { useCallback, useMemo } from 'react';

import { remote } from '@/data/remote';
import { DEMO_FOLLOWED_AT, demoFactsFor, demoFollowsFor, demoMyCourts, demoNowFor, demoRegulars, demoRings, demoToday, withReview, type Seeing } from '@/data/mock/courtLife';
import type { CourtAccess, CourtFacts, CourtFollowCount, CourtNow, CourtReview, CourtRightNow, CourtRing, CourtToday, FollowedCourt, HitRequest, ID, MapVisibility, Post, TaggedCourt, User } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { dayKey, todayStart } from '@/features/places/playedToday';
import { saidYes } from '@/features/players/mapPrivacy';
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
  /** Played here today (features/places/playedToday): what public was at the courts asked about, in your day, by court id. */
  courtToday: Record<string, CourtToday>;
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
  courtFacts: {}, courtFollows: {}, courtNow: {}, courtRegulars: {}, courtRings: [], courtToday: {}, myCourtReviews: {}, followedCourts: null, courtExtras: null,
};

/** What the slice reads from the rest of the app's state. */
interface Reads {
  currentUserId: ID | null; users: User[]; posts: Post[]; hitRequests: HitRequest[]; followingIds: ID[]; blockedIds: ID[]; mutedIds: ID[]; locationEnabled: boolean;
  /** Your answer to "Who can see you on the map?": "I'm playing here" needs a yes (migration 191). */
  mapVisibility: MapVisibility | null | undefined;
  /** Where the phone was last found, and that town's name; a check-in refreshes the first. */
  detectedCoords: { lat: number; lng: number } | null; detectedLocation: string | null;
}

/** A court to follow, with where it is, so "Your courts" can show it at once. */
export type CourtToFollow = TaggedCourt & { access?: CourtAccess };

/** A box of the map, for court rings. */
/** "I'm playing here" went through: when it ends, as the server said it (ISO time). */
export interface CheckedIn { until: string }

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
  /**
   * "I'm playing here", for `minutes` (the "How long are you here?" card: 30
   * minutes to 4 hours, migration 204), or two hours when not said. Resolves
   * when it ends, as the server said it ({ until }; the demo works it out the
   * way the server would), or a sentence when it is refused, so whatever shows
   * "till 6:30pm" from it says what every other place says. `at`: where the phone was found a moment ago
   * by the same tap (Light up at a court, features/places/lightUp), so it is
   * not asked again. With `minutes`, the card that asked buzzes as the court
   * lights, so this does not.
   */
  checkInAtCourt: (courtId: string, at?: { lat: number; lng: number }, minutes?: number) => Promise<CheckedIn | string>;
  checkOutOfCourt: () => Promise<void>;
  /** Court rings in a box of the map. */
  loadCourtRings: (box: MapBox) => Promise<void>;
  /** Only how up to 50 courts are right now (the map's lit courts, features/places/lightUp). */
  loadCourtsNow: (courtIds: string[]) => Promise<void>;
  /** Played here today, for up to 50 courts (features/places/playedToday; only while it is switched on). */
  loadCourtsToday: (courtIds: string[]) => Promise<void>;
}

const seeing = (s: Reads): Seeing => ({ me: s.currentUserId, users: s.users, followingIds: s.followingIds, blockedIds: s.blockedIds, mutedIds: s.mutedIds });
/** The demo's answer for a court, its friends only those you follow (a player who just joined, ?new=1, has none there). */
const demoNow = (id: string, s: Reads): CourtRightNow => { const r = demoNowFor(id); return { ...r, friendIds: r.friendIds.filter((f) => s.followingIds.includes(f)) }; };
const byCourt = <T extends { courtId: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.courtId, r]));
/**
 * Right now at courts as the server says it, keeping when yours ends where this phone knows it and the server
 * did not say (a database before migration 204): "You're here · till 6:30pm" stays right.
 */
const nowKeepingTill = (prev: Record<string, CourtRightNow>, rows: CourtRightNow[]): CourtRightNow[] => rows.map((r) => {
  const was = prev[r.courtId]?.youUntil;
  return r.youHere && !r.youUntil && was && Date.parse(was) > Date.now() ? { ...r, youUntil: was } : r;
});
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
        courtNow: { ...Object.fromEntries(ids.map((id) => [id, demoNow(id, s)])), ...prev.courtNow },
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
      courtNow: now ? { ...prev.courtNow, ...byCourt(nowKeepingTill(prev.courtNow, now)) } : prev.courtNow,
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
      const now = { ...Object.fromEntries(kept.map((c) => [c.courtId, demoNow(c.courtId, s)])), ...s.courtNow };
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

  const checkInAtCourt = useCallback(async (courtId: string, at?: { lat: number; lng: number }, minutes?: number): Promise<CheckedIn | string> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || !isMapCourtId(courtId)) return 'This place isn’t on the map yet.';
    const self = s.users.find((u) => u.id === me);
    if (!self || notKnownAdult(self)) return '“I’m playing here” is for adults only.';
    // A yes to "Who can see you on the map?" first, every time (Apple 5.1.2(i), migration 191): the page
    // that offers the check-in asks (yesFirst) before it gets here; no answer is never taken as a yes.
    // Up to hit at a court (Light up, `at`) reaches here only after that same yes, and is held to it too.
    if (s.mapVisibility === 'none') return 'You chose No one on the map, so no one sees you here.';
    if (!saidYes(s.mapVisibility)) return 'Say who can see you on the map first.';
    // A spot from the same tap (Light up) is Location on already, whatever this render last saw.
    if (!at && !s.locationEnabled) return 'Turn on Location first, so players know you’re really here.';
    // When it ends: the server's answer; in the demo, as the server would hold it (30 minutes to 4 hours, else 2).
    let ends = new Date(Date.now() + (minutes == null ? 120 : Math.min(240, Math.max(30, Math.round(minutes)))) * 60_000).toISOString();
    if (live(me)) {
      // Where the phone is now, not where it was when the app opened: the
      // server checks you are within 5 km of the court (migration 189) and
      // never keeps it. Your pin is the court; nothing else is shared.
      const fix = at ? { ok: true as const, ...at } : await getPosition({ recentMs: 2 * 60_000 });
      if (!fix.ok) return fix.reason === 'denied' ? 'Location is blocked, so we can’t tell you’re here.' : 'Couldn’t find you. Try again.';
      if (stateRef.current.currentUserId !== me) return 'That didn’t go through. Try again.';
      setState((prev) => ({ ...prev, detectedCoords: { lat: fix.lat, lng: fix.lng } }));
      const got = await remote.checkInAtCourt(courtId, { lat: fix.lat, lng: fix.lng }, minutes);
      if ('error' in got) {
        return got.error === 'too_far' ? 'You need to be at the court for that.'
          : got.error === 'location_off' ? 'Turn on Location first, so players know you’re really here.'
            : got.error === 'adults_only' ? '“I’m playing here” is for adults only.'
              : got.error === 'closed_court' ? 'Not at someone’s home court.'
                : got.error === 'slow_down' ? 'That’s a lot of courts today. Try again tomorrow.'
                  : got.error === 'hidden' ? 'You chose No one on the map. Change it in Settings → Privacy.'
                  : got.error === 'ask_first' ? 'Say who can see you on the map first.'
                  : 'That didn’t go through. Try again.';
      }
      ends = got.until;
    }
    // From a light-up's own tap (`at`), that tap has buzzed already; from the card (`minutes`), it buzzes as the court lights: one buzz, not two.
    if (!at && minutes == null) haptics.commit();
    // One court at a time: checking in here checks you out anywhere else.
    setState((prev) => ({
      ...prev,
      courtNow: Object.fromEntries([
        ...Object.entries(prev.courtNow).map(([id, row]) => [id, { ...row, youHere: false }] as const),
        [courtId, { ...(prev.courtNow[courtId] ?? { courtId, playing: 0, friendIds: [] }), youHere: true, youUntil: ends }],
      ]),
      followedCourts: prev.followedCourts?.map((c) => ({ ...c, youHere: c.courtId === courtId })) ?? null,
    }));
    return { until: ends };
  }, [stateRef, setState, live]);

  const checkOutOfCourt = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    haptics.tap();
    // Where you were, so a check-out that does not go through can put you back there.
    const wasNow = Object.keys(stateRef.current.courtNow).filter((id) => stateRef.current.courtNow[id]?.youHere);
    const wasFollowed = (stateRef.current.followedCourts ?? []).filter((c) => c.youHere).map((c) => c.courtId);
    setState((prev) => ({
      ...prev,
      courtNow: Object.fromEntries(Object.entries(prev.courtNow).map(([id, row]) => [id, { ...row, youHere: false }])),
      followedCourts: prev.followedCourts?.map((c) => ({ ...c, youHere: false })) ?? null,
    }));
    if (!live(me)) return;
    const ok = await remote.checkOutOfCourt().catch(() => false);
    if (ok || stateRef.current.currentUserId !== me) return;
    const s = stateRef.current;
    // Checked in somewhere since: that stands.
    if (Object.values(s.courtNow).some((r) => r.youHere) || s.followedCourts?.some((c) => c.youHere)) return;
    setState((prev) => ({
      ...prev,
      courtNow: Object.fromEntries(Object.entries(prev.courtNow).map(([id, row]) => [id, wasNow.includes(id) ? { ...row, youHere: true } : row])),
      followedCourts: prev.followedCourts?.map((c) => (wasFollowed.includes(c.courtId) ? { ...c, youHere: true } : c)) ?? null,
    }));
    showToast({ title: 'You still show here', body: 'Hiding didn’t go through. Try again.', icon: 'alert-circle-outline' });
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

  const loadCourtsToday = useCallback(async (courtIds: string[]) => {
    const ids = [...new Set(courtIds.filter(isMapCourtId))].slice(0, 50);
    const me = stateRef.current.currentUserId;
    if (!ids.length || !me) return;
    const now = new Date();
    const since = todayStart(now);
    const day = dayKey(now);
    const s = stateRef.current;
    const rows = live(me) ? await remote.fetchCourtsToday(ids, since, day).catch(() => null) : demoToday(ids, s.posts, s.hitRequests, seeing(s), since, day);
    if (!rows || stateRef.current.currentUserId !== me) return;
    // The courts asked about take this answer (none: nothing public there today); the rest keep theirs.
    setState((prev) => {
      const next = { ...prev.courtToday };
      for (const id of ids) delete next[id];
      for (const r of rows) next[r.courtId] = r;
      return { ...prev, courtToday: next };
    });
  }, [stateRef, setState, live]);

  const loadCourtsNow = useCallback(async (courtIds: string[]) => {
    const ids = [...new Set(courtIds.filter(isMapCourtId))].slice(0, 50);
    const me = stateRef.current.currentUserId;
    if (!ids.length || !me) return;
    if (!live(me)) {
      // The demo's answers for courts not yet seen; anything changed here (yours, a light-up) stays.
      setState((prev) => {
        const add = ids.filter((id) => !prev.courtNow[id]);
        return add.length ? { ...prev, courtNow: { ...Object.fromEntries(add.map((id) => [id, demoNow(id, stateRef.current)])), ...prev.courtNow } } : prev;
      });
      return;
    }
    const now = await remote.fetchCourtRightNow(ids).catch(() => null);
    if (!now || stateRef.current.currentUserId !== me) return;
    setState((prev) => {
      // Nothing new at any of them: the same state, so nothing on screen redraws.
      const changed = nowKeepingTill(prev.courtNow, now).filter((r) => JSON.stringify(prev.courtNow[r.courtId]) !== JSON.stringify(r));
      return changed.length ? { ...prev, courtNow: { ...prev.courtNow, ...byCourt(changed) } } : prev;
    });
  }, [stateRef, setState, live]);

  return useMemo(() => ({
    loadCourtInfo, loadMyCourtReview, saveCourtReview, toggleCourtFollow, loadFollowedCourts, reportCourtNow, checkInAtCourt, checkOutOfCourt, loadCourtRings, loadCourtsNow, loadCourtsToday,
  }), [loadCourtInfo, loadMyCourtReview, saveCourtReview, toggleCourtFollow, loadFollowedCourts, reportCourtNow, checkInAtCourt, checkOutOfCourt, loadCourtRings, loadCourtsNow, loadCourtsToday]);
}
