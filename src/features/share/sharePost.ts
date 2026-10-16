import { router } from 'expo-router';

import type { ID, Post } from '@/data/types';

/**
 * Whether a post's share arrow opens the Share session screen, Strava's
 * way (Oct 15, owner: "There should be an easy way to share from here. Like
 * Strava"): your own post with a session on it. Send (to someone on
 * CourtSide) is one of that screen's buttons, so nothing is lost. Anyone
 * else's post, and yours without a session, sends as before.
 */
export function sharesSession(post: Pick<Post, 'authorId' | 'session'>, me: ID | null | undefined): boolean {
  return !!me && post.authorId === me && !!post.session;
}

/** What a post's share arrow says to a screen reader. */
export function shareLabel(post: Pick<Post, 'authorId' | 'session'>, me: ID | null | undefined, what: 'post' | 'clip' = 'post'): string {
  return sharesSession(post, me) ? 'Share your session' : `Send this ${what} to someone`;
}

/** A post's share arrow: the Share session screen for your own session, else Send to someone on CourtSide. */
export function sharePost(post: Pick<Post, 'id' | 'authorId' | 'session'>, me: ID | null | undefined) {
  if (sharesSession(post, me)) router.push({ pathname: '/share-session', params: { post: post.id } });
  else router.push(`/share?kind=post&id=${post.id}`);
}
