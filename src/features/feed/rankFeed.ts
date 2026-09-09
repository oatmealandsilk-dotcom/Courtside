import type { Post, Question, Comment } from '@/data/types';
export type FeedItem = { type: 'post'; post: Post } | { type: 'question'; question: Question };

/** Session-local recommendations: likes, authored posts, comments and question votes. */
export function rankFeed(posts: Post[], questions: Question[], comments: Comment[], userId: string | null): FeedItem[] {
  const interests = new Map<string, number>();
  const add = (tags: string[], weight: number) => tags.forEach(tag => interests.set(tag, (interests.get(tag) ?? 0) + weight));
  posts.forEach(p => {
    const engaged = p.authorId === userId || (!!userId && p.likedBy.includes(userId)) || comments.some(c => c.postId === p.id && c.authorId === userId);
    if (engaged) add([p.kind, ...p.tags], 2);
  });
  questions.forEach(q => { if (q.authorId === userId || (!!userId && q.votedBy[userId] === 1)) add([q.topic, ...q.tags], 3); });
  const score = (tags: string[], date: string) => tags.reduce((sum, t) => sum + (interests.get(t) ?? 0), 0) + 3 / (1 + Math.max(0, Date.now() - Date.parse(date)) / 86400000);
  const sorted = [...posts].sort((a,b) => score([b.kind,...b.tags],b.createdAt) - score([a.kind,...a.tags],a.createdAt));
  const reels = sorted.filter(p => p.kind === 'reel');
  const others = sorted.filter(p => p.kind !== 'reel');
  const forum = [...questions].sort((a,b) => score([b.topic,...b.tags],b.createdAt) - score([a.topic,...a.tags],a.createdAt));
  const result: FeedItem[] = [];
  // Lead with a reel, then retain a varied mix instead of letting one topic take over.
  while (reels.length || others.length || forum.length) {
    const reel = reels.shift(); if (reel) result.push({ type: 'post', post: reel });
    const post = others.shift(); if (post) result.push({ type: 'post', post });
    const question = forum.shift(); if (question) result.push({ type: 'question', question });
    const next = others.shift(); if (next) result.push({ type: 'post', post: next });
  }
  return result;
}
