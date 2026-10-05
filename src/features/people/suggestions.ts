import { useMemo } from 'react';

import type { User } from '@/data/types';
import { useFindable } from '@/features/people/findable';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';

export interface Suggestion { user: User; reason: string }

/** "Raleigh, NC" → "Raleigh": two players in the same town share this. */
const townOf = (location: string) => location.split(',')[0].trim();

/**
 * At most this many people a list asks the server about (open_to_you, which
 * counts toward the day's 300 people asked about, migration 109). More than
 * any strip shows (10 at most), and the same people day to day, so it never
 * eats into what chats, groups and tags need.
 */
const ASK_AT_MOST = 24;

/**
 * Players you might know, best first: people you have talked to or who
 * liked or commented on your posts, then people who play where you do (or,
 * given `near`, in the town of the profile you are looking at), then
 * coaches. Never you, anyone blocked either way, a suspended account (see
 * useFindable), anyone in `exclude`, or anyone you already follow, except
 * those in `keep`: followed from the very strip showing them, so they stay
 * put saying Following, the way Instagram does (vanishing on the tap read as
 * the tap failing).
 *
 * The teen rule (Instagram's teen accounts): nobody is put in front of a
 * stranger the teen rules keep them from. Someone who follows you can
 * always be suggested (a follow back). Anyone else only to someone known to
 * be an adult, and only when the server says that adult may reach them
 * (open_to_you: they are known to be an adult, or they follow you), the
 * same answer as a new chat; until it answers, they are not shown. So a
 * teen is never suggested to an adult stranger, and a teen (or an account
 * with no birthday yet) is suggested only the people who follow them. The
 * app never learns anyone's age to do this, only that yes or no.
 */
export function useSuggestedPlayers({ keep = [], near, exclude = [] }: { keep?: string[]; near?: string; exclude?: string[] } = {}): Suggestion[] {
  const { users, posts, comments, conversations, currentUserId, followingIds, followEdges, openness, agesOnProfiles, actions } = useApp();
  const { findable } = useFindable();
  const keepKey = keep.join(',');
  const excludeKey = exclude.join(',');
  return useMemo(() => {
    if (!currentUserId) return [];
    const me = users.find((u) => u.id === currentUserId);
    const following = new Set(followingIds);
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    const kept = new Set(keepKey ? keepKey.split(',') : []);
    const left = new Set(excludeKey ? excludeKey.split(',') : []);
    const interacted = new Set<string>();
    for (const post of posts) {
      if (post.authorId === currentUserId) post.likedBy.forEach((id) => interacted.add(id));
      else if (post.likedBy.includes(currentUserId)) interacted.add(post.authorId);
    }
    const postById = new Map(posts.map((p) => [p.id, p]));
    for (const comment of comments) {
      const post = postById.get(comment.postId);
      if (post?.authorId === currentUserId) interacted.add(comment.authorId);
    }
    for (const conversation of conversations) conversation.participantIds.forEach((id) => interacted.add(id));
    const myTown = me ? townOf(me.location) : '';
    const theirTown = near ? townOf(near) : '';
    const ranked = users
      .filter((u) => findable(u) && !left.has(u.id) && (!following.has(u.id) || kept.has(u.id)))
      .map((user) => {
        const town = townOf(user.location);
        const local = !!town && town === myTown;
        const sameAsThem = !!town && town === theirTown;
        const reason = interacted.has(user.id) ? 'Interacted with you'
          : user.isCoach ? 'Coach on CourtSide'
          : local || sameAsThem ? `Plays in ${town}`
          : 'Suggested for you';
        return { user, reason, score: (interacted.has(user.id) ? 2 : 0) + (local ? 1 : 0) + (sameAsThem ? 1 : 0) + (user.isCoach ? 0.5 : 0) };
      })
      .sort((a, b) => b.score - a.score);
    // Who may be shown (see above): a follow back always; anyone else only to
    // a known adult the server lets reach them, asked about the best few only.
    const adult = !!me && !notKnownAdult(me);
    let asked = 0;
    const shown: Suggestion[] = [];
    for (const { user, reason } of ranked) {
      if (followsMe.has(user.id)) { shown.push({ user, reason }); continue; }
      if (!adult || asked >= ASK_AT_MOST) continue;
      asked += 1;
      // canAddToGroup asks the server (and, before migration 64 or in the
      // demo, goes by age). An answer of "won't say" (past the day's limit,
      // say) leaves a chat to the server's own check, but is not a yes here:
      // only a plain yes puts someone in front of you.
      const told = openness[user.id];
      if (actions.canAddToGroup(user.id) && (!told || told.chat === true)) shown.push({ user, reason });
    }
    return shown;
    // agesOnProfiles: canAddToGroup reads it, so the list is worked out again
    // when the first load says which database this is.
  }, [users, posts, comments, conversations, currentUserId, followingIds, followEdges, openness, agesOnProfiles, actions, findable, keepKey, excludeKey, near]);
}
