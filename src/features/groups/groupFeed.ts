import type { FeedGroup, ID, Post } from '@/data/types';

/*
 * What is in a group's feed (migration 74, the owner's rule of Oct 3: "it's
 * just like a big group feed"): everything the people in it now post, from
 * before they joined too, plus what was shared to that group only. A post
 * shared to a different group never is. Someone who leaves takes their posts
 * with them. The server decides who may read what (group_feed); this picks
 * the group's posts out of everything the app already holds, so the demo and
 * a real account work the same way.
 */
export function inGroupFeed(
  post: Pick<Post, 'authorId' | 'groupId' | 'archived'>,
  groupId: ID,
  group: Pick<FeedGroup, 'members'> | undefined,
): boolean {
  if (post.archived) return false;
  if (post.groupId) return post.groupId === groupId && (!group || group.members.some((m) => m.id === post.authorId));
  return !!group && group.members.some((m) => m.id === post.authorId);
}

/** Your groups' names, joined for a sentence: a post to Everyone also shows in each of them, for the composer's note ("Everyone · also shows in RRC"). */
export function alsoShowsIn(groups: Pick<FeedGroup, 'name'>[]): string {
  const names = groups.map((g) => g.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
