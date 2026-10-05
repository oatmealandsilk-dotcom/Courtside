import { useMemo } from 'react';

import type { User } from '@/data/types';
import { useFindable } from '@/features/people/findable';
import { useApp } from '@/store/AppContext';

export interface Suggestion { user: User; reason: string }

/** "Raleigh, NC" → "Raleigh": two players in the same town share this. */
const townOf = (location: string) => location.split(',')[0].trim();

/**
 * Players you might know, best first: people you have talked to or who
 * liked or commented on your posts, then people who play where you do (or,
 * given `near`, in the town of the profile you are looking at), then
 * coaches. Never you, anyone blocked either way, a suspended account (see
 * useFindable), anyone in `exclude`, or anyone you already follow, except
 * those in `keep`: followed from the very strip showing them, so they stay
 * put saying Following, the way Instagram does (vanishing on the tap read as
 * the tap failing).
 */
export function useSuggestedPlayers({ keep = [], near, exclude = [] }: { keep?: string[]; near?: string; exclude?: string[] } = {}): Suggestion[] {
  const { users, posts, comments, conversations, currentUserId, followingIds } = useApp();
  const { findable } = useFindable();
  const keepKey = keep.join(',');
  const excludeKey = exclude.join(',');
  return useMemo(() => {
    if (!currentUserId) return [];
    const me = users.find((u) => u.id === currentUserId);
    const following = new Set(followingIds);
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
    return users
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
      .sort((a, b) => b.score - a.score)
      .map(({ user, reason }) => ({ user, reason }));
  }, [users, posts, comments, conversations, currentUserId, followingIds, findable, keepKey, excludeKey, near]);
}
