import type { FeedGroup, Post } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's groups (migration 67): one you started, one you joined. Only
 * without a database; a real account's come from my_feed_groups().
 */

const isoHoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/*
 * Design preview only (Oct 22, the Groups sheet): a demo web build opened with
 * ?gdemo=a|b|c shows one of three set-ups, kept for the tab's session.
 *   a: in no groups, nothing to join
 *   b: in one group (you run it, someone is asking), three open groups near you
 *   c: in three groups (the most), groups near you to join
 * Without it (and always on a phone) the demo is as it was. Never live data.
 */
const demoSetup: 'a' | 'b' | 'c' | null = (() => {
  try {
    if (typeof window === 'undefined' || !window.location || typeof window.location.search !== 'string') return null;
    const asked = new URLSearchParams(window.location.search).get('gdemo');
    const store = window.sessionStorage;
    if (asked === 'a' || asked === 'b' || asked === 'c') { store?.setItem('courtside-gdemo', asked); return asked; }
    if (asked === 'off') { store?.removeItem('courtside-gdemo'); return null; }
    const kept = store?.getItem('courtside-gdemo');
    return kept === 'a' || kept === 'b' || kept === 'c' ? kept : null;
  } catch {
    return null;
  }
})();

const allDemoGroups: FeedGroup[] = [
  {
    id: 'g-wakefield',
    name: 'Wakefield crew',
    description: 'Saturday mornings at Wakefield. Doubles, then coffee.',
    ask: false,
    look: { emoji: '🎾' },
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
    look: { color: 'hard' },
    createdAt: isoHoursAgo(24 * 9),
    members: [
      { id: 'u-sam', admin: true },
      { id: CURRENT_USER_ID, admin: false },
      { id: 'u-tomas', admin: false },
    ],
    requests: [],
  },
  {
    id: 'g-ladder',
    name: 'Sunday ladder',
    description: 'A singles ladder at Griffith Park. Challenge anyone two rungs up.',
    ask: false,
    look: { color: 'grass' },
    createdAt: isoHoursAgo(24 * 4),
    members: [
      { id: 'u-leo', admin: true },
      { id: CURRENT_USER_ID, admin: false },
      { id: 'u-priya', admin: false },
      { id: 'u-marcus', admin: false },
      { id: 'u-rosa', admin: false },
      { id: 'u-ella', admin: false },
      { id: 'u-noor', admin: false },
    ],
    requests: [],
  },
];

export const demoGroups: FeedGroup[] =
  demoSetup === 'a' ? [] : demoSetup === 'b' ? allDemoGroups.slice(0, 1) : demoSetup === 'c' ? allDemoGroups : allDemoGroups.slice(0, 2);

/*
 * Groups the demo's Find groups window lists (the "+" on the Feed): ones you
 * are not in yet, some near you (the demo's player is in Los Angeles), some
 * open, some asking first. Joining one makes it yours, as on a real account.
 */
const crewIds = ['u-mira', 'u-dev', 'u-june', 'u-tomas', 'u-nadia', 'u-leo', 'u-sam', 'u-priya', 'u-marcus', 'u-rosa', 'u-kai', 'u-ella', 'u-noor', 'u-theo', 'u-lena', 'u-omar', 'u-bea', 'u-jonah', 'u-ivy', 'u-diego'];
const crew = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: crewIds[(from + i) % crewIds.length], admin: i === 0 }));

const allDiscoverGroups: (FeedGroup & { near: boolean })[] = [
  { id: 'g-silverlake', name: 'Silver Lake sunrise', look: { color: 'gold', emoji: '☀️' }, description: '6:30am hitting before work. All levels welcome.', ask: false, near: true, createdAt: isoHoursAgo(24 * 30), members: crew(3, 9), requests: [] },
  { id: 'g-pasadena', name: 'Pasadena 4.0 doubles', look: { color: 'hard' }, description: 'Competitive doubles on Sundays. Say your level when you ask.', ask: true, near: true, createdAt: isoHoursAgo(24 * 50), members: crew(7, 14), requests: [] },
  { id: 'g-venice', name: 'Venice rallies', look: { color: 'clay', emoji: '🌴' }, description: 'Casual hitting by the boardwalk, then tacos.', ask: false, near: true, createdAt: isoHoursAgo(24 * 6), members: crew(12, 6), requests: [] },
  { id: 'g-over40', name: 'Over-40 comeback club', look: { color: 'grass', emoji: '💪' }, description: 'Back on court after a break. Fitness, drills, no egos.', ask: true, near: false, createdAt: isoHoursAgo(24 * 80), members: crew(1, 17), requests: [] },
  { id: 'g-lefties', name: 'Lefties', look: { color: 'red' }, description: 'Left-handed players swapping tips and match videos.', ask: false, near: false, createdAt: isoHoursAgo(24 * 40), members: crew(5, 12), requests: [] },
  { id: 'g-serve-lab', name: 'Serve lab', look: { color: 'ink', emoji: '🎯' }, description: 'Post your serve, get notes from the group.', ask: false, near: false, createdAt: isoHoursAgo(24 * 12), members: crew(9, 8), requests: [] },
  { id: 'g-echo-park', name: 'Echo Park evenings', look: { color: 'accent' }, description: 'Lights on at 7. Singles or doubles, whoever turns up.', ask: false, near: true, createdAt: isoHoursAgo(24 * 3), members: crew(14, 5), requests: [] },
];

const pick = (ids: string[]) => ids.map((id) => allDiscoverGroups.find((g) => g.id === id)).filter((g): g is (FeedGroup & { near: boolean }) => !!g);
export const demoDiscoverGroups: (FeedGroup & { near: boolean })[] =
  demoSetup === 'a' ? []
  : demoSetup === 'b' ? pick(['g-silverlake', 'g-venice', 'g-echo-park', 'g-over40', 'g-lefties'])
  : allDiscoverGroups.filter((g) => g.id !== 'g-echo-park');

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
