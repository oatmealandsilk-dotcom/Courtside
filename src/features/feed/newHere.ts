import type { Post } from '@/data/types';

/** How long a first post keeps its "New to CourtSide" tag and its nudge up the feed. */
const WELCOME_DAYS = 14;

/** A new player's first post, still in its welcome window. */
export const isNewHere = (post: Pick<Post, 'isFirst' | 'createdAt'>) =>
  !!post.isFirst && Date.now() - Date.parse(post.createdAt) < WELCOME_DAYS * 86_400_000;
