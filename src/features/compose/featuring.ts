import type { Post } from '@/data/types';

/**
 * Whether a post can ever be featured on CourtSide's Instagram, so whether
 * it shows the "Let CourtSide feature this on its Instagram" switch on Edit
 * post (owner, Oct 5). The same posts as the composer leaves it off: one
 * shared only to a group, and one with a logged or tracked session's stats
 * on it (a "Log it" post too) are never featured. A plain "Minutes on court"
 * is not a session's stats, so that post keeps its switch. The server holds
 * the tracker rule too (a tracker session's post stays off whatever is sent).
 * The Terms ("When CourtSide features your post") say the same; change them
 * together.
 */
export function canBeFeatured(post: Pick<Post, 'groupId' | 'session'>): boolean {
  const s = post.session;
  return !post.groupId && !s?.activityId && !s?.sessionId && !s?.kind;
}
