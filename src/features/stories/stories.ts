import type { ID, Story, User } from '@/data/types';
import { timeLeft } from '@/lib/format';

/** On the rail right now: not put away, not taken down by an admin (migration 108), not yet a day old. */
export const isLive = (story: Story, now = Date.now()) => !story.archived && !story.removed && Date.parse(story.expiresAt) > now;

/** An Instant's clock: the time it has left while it is up, else "removed" (taken down), "archived" (put away early) or "expired". */
export const hitClock = (story: Story, now = Date.now()) =>
  isLive(story, now) ? timeLeft(story.expiresAt, new Date(now)) : story.removed ? 'removed' : Date.parse(story.expiresAt) > now ? 'archived' : 'expired';

/** Everything of yours that has left the rail, newest first. */
export const archivedStories = (stories: Story[], me: ID | null, now = Date.now()) =>
  stories
    .filter((s) => s.authorId === me && !isLive(s, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export interface RailEntry {
  user: User;
  stories: Story[];
  /** Every story of theirs has been watched. */
  seen: boolean;
}

/**
 * One tile per player with something live, you first, then anyone you have
 * not caught up on, then the rest — each group newest first. You are always
 * first even with nothing up, so the rail is also where you add a story.
 */
export function railEntries(stories: Story[], users: User[], me: ID | null, hidden: ID[] = [], now = Date.now()): RailEntry[] {
  const live = stories.filter((s) => isLive(s, now) && !hidden.includes(s.authorId));
  const byAuthor = new Map<ID, Story[]>();
  for (const story of live) byAuthor.set(story.authorId, [...(byAuthor.get(story.authorId) ?? []), story]);
  const entries: RailEntry[] = [];
  for (const [authorId, list] of byAuthor) {
    const user = users.find((u) => u.id === authorId);
    if (!user) continue;
    const ordered = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    entries.push({ user, stories: ordered, seen: !!me && ordered.every((s) => s.viewedBy.includes(me)) });
  }
  const latest = (e: RailEntry) => Date.parse(e.stories[e.stories.length - 1].createdAt);
  entries.sort((a, b) => {
    if (a.user.id === me) return -1;
    if (b.user.id === me) return 1;
    if (a.seen !== b.seen) return a.seen ? 1 : -1;
    return latest(b) - latest(a);
  });
  const self = users.find((u) => u.id === me);
  if (self && !entries.some((e) => e.user.id === me)) entries.unshift({ user: self, stories: [], seen: true });
  return entries;
}
