import { useCallback, useMemo } from 'react';
import type { User } from '@/data/types';
import { useApp } from '@/store/AppContext';

export interface MentionCandidate {
  user: User;
  /** Why they are near the top: shown as a small tag. */
  reason: 'Following' | 'Follows you' | 'Interacts with you' | '';
}

/**
 * Who to offer when someone types "@": people you follow first, then people
 * who follow you, then people you interact with (likes, comments, messages),
 * then everyone else — the same order Instagram uses. Typing narrows the list
 * by handle or name without changing that order.
 */
export function useMentionCandidates() {
  const { users, currentUserId, followingIds, followEdges, posts, comments, conversations, blockedIds } = useApp();

  const ranked = useMemo<MentionCandidate[]>(() => {
    if (!currentUserId) return [];
    const following = new Set(followingIds);
    const followers = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    const interacted = new Map<string, number>();
    const bump = (id: string) => interacted.set(id, (interacted.get(id) ?? 0) + 1);
    for (const post of posts) {
      if (post.authorId === currentUserId) post.likedBy.forEach(bump);
      else if (post.likedBy.includes(currentUserId)) bump(post.authorId);
    }
    for (const comment of comments) {
      const post = posts.find((p) => p.id === comment.postId);
      if (post?.authorId === currentUserId && comment.authorId !== currentUserId) bump(comment.authorId);
      if (comment.authorId === currentUserId && post && post.authorId !== currentUserId) bump(post.authorId);
    }
    for (const conversation of conversations) conversation.participantIds.forEach((id) => { if (id !== currentUserId) bump(id); });
    const hidden = new Set(blockedIds);
    const tier = (id: string) => (following.has(id) ? 0 : followers.has(id) ? 1 : interacted.has(id) ? 2 : 3);
    return users
      .filter((u) => u.id !== currentUserId && !hidden.has(u.id))
      .map((user) => ({
        user,
        reason: (following.has(user.id) ? 'Following' : followers.has(user.id) ? 'Follows you' : interacted.has(user.id) ? 'Interacts with you' : '') as MentionCandidate['reason'],
      }))
      .sort((a, b) => {
        const t = tier(a.user.id) - tier(b.user.id);
        if (t) return t;
        // Within a tier, the people you deal with most come first.
        const i = (interacted.get(b.user.id) ?? 0) - (interacted.get(a.user.id) ?? 0);
        if (i) return i;
        return a.user.name.localeCompare(b.user.name);
      });
  }, [users, currentUserId, followingIds, followEdges, posts, comments, conversations, blockedIds]);

  return useCallback((query: string, limit = 8) => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? ranked.filter(({ user }) => user.handle.toLowerCase().startsWith(q) || user.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(q)))
      : ranked;
    return matches.slice(0, limit);
  }, [ranked]);
}
