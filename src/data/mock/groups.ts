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

/*
 * Groups the demo's Find groups window lists (the "+" on the Feed): ones you
 * are not in yet, some near you (the demo's player is in Los Angeles), some
 * open, some asking first. Joining one makes it yours, as on a real account.
 */
const crewIds = ['u-mira', 'u-dev', 'u-june', 'u-tomas', 'u-nadia', 'u-leo', 'u-sam', 'u-priya', 'u-marcus', 'u-rosa', 'u-kai', 'u-ella', 'u-noor', 'u-theo', 'u-lena', 'u-omar', 'u-bea', 'u-jonah', 'u-ivy', 'u-diego'];
const crew = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: crewIds[(from + i) % crewIds.length], admin: i === 0 }));

export const demoDiscoverGroups: (FeedGroup & { near: boolean })[] = [
  { id: 'g-silverlake', name: 'Silver Lake sunrise', description: '6:30am hitting before work. All levels welcome.', ask: false, near: true, createdAt: isoHoursAgo(24 * 30), members: crew(3, 9), requests: [] },
  { id: 'g-pasadena', name: 'Pasadena 4.0 doubles', description: 'Competitive doubles on Sundays. Say your level when you ask.', ask: true, near: true, createdAt: isoHoursAgo(24 * 50), members: crew(7, 14), requests: [] },
  { id: 'g-venice', name: 'Venice rallies', description: 'Casual hitting by the boardwalk, then tacos.', ask: false, near: true, createdAt: isoHoursAgo(24 * 6), members: crew(12, 6), requests: [] },
  { id: 'g-over40', name: 'Over-40 comeback club', description: 'Back on court after a break. Fitness, drills, no egos.', ask: true, near: false, createdAt: isoHoursAgo(24 * 80), members: crew(1, 17), requests: [] },
  { id: 'g-lefties', name: 'Lefties', description: 'Left-handed players swapping tips and match videos.', ask: false, near: false, createdAt: isoHoursAgo(24 * 40), members: crew(5, 12), requests: [] },
  { id: 'g-serve-lab', name: 'Serve lab', description: 'Post your serve, get notes from the group.', ask: false, near: false, createdAt: isoHoursAgo(24 * 12), members: crew(9, 8), requests: [] },
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
