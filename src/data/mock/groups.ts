import type { FeedGroup, Post } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's groups (migration 67): one you started, one you joined. Only
 * without a database; a real account's come from my_feed_groups().
 */

const isoHoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const demoGroups: FeedGroup[] = [
  {
    id: 'g-wakefield',
    name: 'Wakefield crew',
    description: 'Saturday mornings at Wakefield. Doubles, then coffee.',
    ask: false,
    createdAt: isoHoursAgo(24 * 20),
    members: [
      { id: CURRENT_USER_ID, admin: true },
      { id: 'u-mira', admin: false },
      { id: 'u-dev', admin: false },
      { id: 'u-june', admin: false },
    ],
    requests: ['u-kai'],
  },
  {
    id: 'g-jv',
    name: 'JV team',
    description: 'Practice notes and match days.',
    ask: true,
    createdAt: isoHoursAgo(24 * 9),
    members: [
      { id: 'u-sam', admin: true },
      { id: CURRENT_USER_ID, admin: false },
      { id: 'u-tomas', admin: false },
    ],
    requests: [],
  },
];

export const demoGroupPosts: Post[] = [
  {
    id: 'p-group-wake-1',
    authorId: 'u-mira',
    kind: 'note',
    createdAt: isoHoursAgo(3),
    body: 'Courts 3 and 4 are ours from 8. Bring balls, I forgot mine last week.',
    likedBy: ['u-dev'],
    commentIds: [],
    tags: [],
    groupId: 'g-wakefield',
  },
  {
    id: 'p-group-wake-2',
    authorId: 'u-dev',
    kind: 'note',
    createdAt: isoHoursAgo(30),
    body: 'Good doubles today. We won the last set 6–4 and nobody is letting June forget that lob.',
    likedBy: [CURRENT_USER_ID, 'u-june'],
    commentIds: [],
    tags: [],
    groupId: 'g-wakefield',
  },
  {
    id: 'p-group-jv-1',
    authorId: 'u-sam',
    kind: 'note',
    createdAt: isoHoursAgo(6),
    body: 'Match on Thursday moved to 4pm. Warm-up at 3:30, serves first.',
    likedBy: [],
    commentIds: [],
    tags: [],
    groupId: 'g-jv',
  },
];
