import { useEffect, useMemo, useState } from 'react';

import type { ID, Post, User } from '@/data/types';
import { useFindable } from '@/features/people/findable';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { hasSessionStats } from './format';

/*
 * Activities for a new player (owner, Oct 6: "make sure the activity thing
 * is very relevant so that when people use it first, they can log their
 * activities straight away and see activities"). Activities shows your
 * sessions and those of the people you follow; someone who has just joined
 * follows nobody, so it was empty. Until you follow a few people it also
 * shows sessions posted to everyone by players in your town, marked "Near
 * you" with a Follow button.
 *
 * Who may be shown follows the suggestions' rule (features/people/
 * suggestions), the teen rules: someone who follows you always; anyone
 * else only to someone known to be an adult, and only when the server says
 * that adult may reach them (open_to_you, the same answer as a new chat).
 * So a teen's session is never put in front of an adult stranger, and a
 * teen sees only the sessions of people who follow them. Blocked either
 * way, suspended, private (unless you follow them: the feed's own rule),
 * muted and group-only posts never show.
 */

/** Following fewer than this many people: Activities also shows sessions from players near you. */
export const NEAR_UNDER = 5;
/** At most this many people the list asks the server about (open_to_you counts toward a daily limit, migration 109). */
const ASK_AT_MOST = 24;

/** "Raleigh, NC" → "raleigh": two players in the same town share this. */
const townOf = (location: string | undefined) => (location ?? '').split(',')[0].trim().toLowerCase();

/** A session posted to everyone with its numbers on it, and its picture (if any) reachable from anywhere. */
export const isPostedSession = (p: Post) => !p.archived && !p.removed && !p.groupId && !!p.session && hasSessionStats(p.session)
  && [p.imageUrl, p.videoUrl].every((u) => !u || /^(https?:|data:|blob:)/.test(u));

/**
 * The players whose posted sessions Activities may show you as "Near you":
 * empty once you follow NEAR_UNDER people or more. Never you or anyone you
 * follow (their sessions are in Activities anyway). `on`: false asks nothing (a feed other than Activities).
 */
export function useNearYouAuthors(on = true): Set<ID> {
  const { users, posts, currentUserId, followingIds, followEdges, mutedIds, openness, agesOnProfiles, actions } = useApp();
  const { findable } = useFindable();
  return useMemo(() => {
    const none = new Set<ID>();
    if (!on || !currentUserId || followingIds.length >= NEAR_UNDER) return none;
    const me = users.find((u) => u.id === currentUserId);
    const myTown = townOf(me?.location);
    if (!me || !myTown) return none;
    const following = new Set(followingIds);
    const muted = new Set(mutedIds);
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    const byId = new Map(users.map((u) => [u.id, u]));
    // Newest session first, so the server is asked about those you would see first.
    const authors: User[] = [];
    const seen = new Set<ID>();
    for (const p of [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
      if (seen.has(p.authorId) || !isPostedSession(p)) continue;
      seen.add(p.authorId);
      const u = byId.get(p.authorId);
      if (!findable(u) || following.has(u.id) || muted.has(u.id) || u.isPrivate || townOf(u.location) !== myTown) continue;
      authors.push(u);
    }
    const adult = !notKnownAdult(me);
    const shown = new Set<ID>();
    let asked = 0;
    for (const u of authors) {
      if (followsMe.has(u.id)) { shown.add(u.id); continue; }
      if (!adult || asked >= ASK_AT_MOST) continue;
      asked += 1;
      // Only a plain yes from the server puts someone in front of you (as in suggestions).
      const told = openness[u.id];
      if (actions.canAddToGroup(u.id) && (!told || told.chat === true)) shown.add(u.id);
    }
    return shown;
    // agesOnProfiles: canAddToGroup reads it.
  }, [on, users, posts, currentUserId, followingIds, followEdges, mutedIds, openness, agesOnProfiles, actions, findable]);
}

/** Who invited you, asked once per account (null: nobody, or not known). */
const inviters = new Map<ID, Promise<ID | null>>();

/**
 * The person whose invite you joined through, to suggest first, by the
 * same rule as migration 84's automatic follow: only when the two of you
 * may be put in front of each other (both known adults, or they follow
 * you). A teen's inviter of their own age is already followed (migration
 * 84). Null when there is none to suggest, or you already follow them;
 * undefined until the server has answered (the first-move page waits for it,
 * so the inviter is never missed by a page that settles first).
 */
export function useInviterToFollow(): User | null | undefined {
  const { currentUserId, users, followingIds, actions } = useApp();
  const { findable } = useFindable();
  const [id, setId] = useState<ID | null | undefined>(undefined);
  useEffect(() => {
    if (!currentUserId) return undefined;
    let on = true;
    let asked = inviters.get(currentUserId);
    if (!asked) {
      asked = actions.myInviter().then((r) => r?.id ?? null).catch(() => null);
      inviters.set(currentUserId, asked);
    }
    void asked.then((got) => { if (on) setId(got); });
    return () => { on = false; };
  }, [currentUserId, actions]);
  return useMemo(() => {
    if (id === undefined) return undefined;
    const u = id ? users.find((x) => x.id === id) : undefined;
    if (!findable(u) || followingIds.includes(u.id) || !actions.canAddToGroup(u.id)) return null;
    return u;
  }, [id, users, findable, followingIds, actions]);
}
