import type { Post, Question, Comment, Story } from '@/data/types';
export type FeedItem = { type: 'post'; post: Post } | { type: 'question'; question: Question } | { type: 'hit'; story: Story } | { type: 'tip' };

/** Session-local recommendations: likes, authored posts, comments and question votes. */
export function rankFeed(posts: Post[], questions: Question[], comments: Comment[], userId: string | null, hits: Story[] = []): FeedItem[] {
  const interests = new Map<string, number>();
  const add = (tags: string[], weight: number) => tags.forEach(tag => interests.set(tag, (interests.get(tag) ?? 0) + weight));
  posts.forEach(p => {
    const engaged = p.authorId === userId || (!!userId && p.likedBy.includes(userId)) || comments.some(c => c.postId === p.id && c.authorId === userId);
    if (engaged) add([p.kind, ...p.tags], 2);
  });
  questions.forEach(q => { if (q.authorId === userId || (!!userId && q.votedBy[userId] === 1)) add([q.topic, ...q.tags], 3); });
  const score = (tags: string[], date: string) => tags.reduce((sum, t) => sum + (interests.get(t) ?? 0), 0) + 3 / (1 + Math.max(0, Date.now() - Date.parse(date)) / 86400000);
  const sorted = [...posts].sort((a,b) => score([b.kind,...b.tags],b.createdAt) - score([a.kind,...a.tags],a.createdAt));
  const clips = sorted.filter(p => p.kind === 'clip');
  const others = sorted.filter(p => p.kind !== 'clip');
  const forum = [...questions].sort((a,b) => score([b.topic,...b.tags],b.createdAt) - score([a.topic,...a.tags],a.createdAt));
  // Hits are today's moments: yours first, then newest first.
  const moments = [...hits].sort((a, b) => (a.authorId === userId ? -1 : b.authorId === userId ? 1 : Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  const result: FeedItem[] = [];
  // Lead with a clip, then retain a varied mix instead of letting one topic take over.
  while (clips.length || others.length || forum.length || moments.length) {
    const clip = clips.shift(); if (clip) result.push({ type: 'post', post: clip });
    const post = others.shift(); if (post) result.push({ type: 'post', post });
    const question = forum.shift(); if (question) result.push({ type: 'question', question });
    const hit = moments.shift(); if (hit) result.push({ type: 'hit', story: hit });
    const next = others.shift(); if (next) result.push({ type: 'post', post: next });
  }
  return result;
}
