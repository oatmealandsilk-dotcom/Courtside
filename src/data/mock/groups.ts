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
 *   b: in one group (you run it, someone is asking), groups near you and in Raleigh
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

/*
 * The demo's player lives in Wakefield (north Raleigh), so its groups are
 * Raleigh ones: the courts, the usual times and the levels a player would
 * say out loud live in src/features/groups/previewFacts.ts (preview only).
 * Photos of the courts are only used in a design preview (?gdemo): the files
 * are never in the app, so a build without them shows each group's initials.
 */
const photo = (key: string) => (demoSetup ? { photoUrl: `/preview-covers/${key}-square.jpg` } : {});
const m = (id: string, admin = false) => ({ id, admin });
const crewIds = ['u-mira', 'u-dev', 'u-june', 'u-tomas', 'u-nadia', 'u-leo', 'u-sam', 'u-priya', 'u-marcus', 'u-rosa', 'u-kai', 'u-ella', 'u-noor', 'u-theo', 'u-lena', 'u-omar', 'u-bea', 'u-jonah', 'u-ivy', 'u-diego'];
/** `n` people, `admin` first, then the demo's players from `from` on (a big group repeats a few, as only its count shows). */
const crew = (admin: string, from: number, n: number) => [m(admin, true), ...Array.from({ length: n - 1 }, (_, i) => m(crewIds[(from + i) % crewIds.length]))];

const rrc: FeedGroup = {
  id: 'g-rrc',
  name: 'RRC',
  description: 'Raleigh Racquet Club regulars. Inside the bubble when it rains.',
  ask: true,
  look: { color: 'hard', ...photo('rrc') },
  createdAt: isoHoursAgo(24 * 40),
  members: [m(CURRENT_USER_ID, true), ...['u-mira', 'u-dev', 'u-june', 'u-tomas', 'u-sam', 'u-priya', 'u-marcus', 'u-rosa', 'u-ella', 'u-noor', 'u-theo', 'u-lena', 'u-omar'].map((id) => m(id))],
  requests: ['u-kai'],
};
const wakeWed: FeedGroup = {
  id: 'g-wakewed',
  name: 'Wakefield Wednesday doubles',
  description: 'Doubles after work. Bring a can if you have one.',
  ask: false,
  look: { color: 'grass', ...photo('wakefield') },
  createdAt: isoHoursAgo(24 * 22),
  members: [m('u-dev', true), m(CURRENT_USER_ID), ...['u-june', 'u-sam', 'u-priya', 'u-kai', 'u-ella', 'u-noor', 'u-bea', 'u-jonah', 'u-ivy'].map((id) => m(id))],
  requests: [],
};
const millbrook: FeedGroup = {
  id: 'g-millbrook',
  name: 'Millbrook 4.0 ladder',
  description: 'Challenge anyone two spots above you. Post the score here.',
  ask: true,
  look: { color: 'clay', ...photo('millbrook') },
  createdAt: isoHoursAgo(24 * 60),
  members: [...crew('u-leo', 2, 22), m(CURRENT_USER_ID)],
  requests: [],
};

const allDemoGroups: FeedGroup[] = [rrc, wakeWed, millbrook];

export const demoGroups: FeedGroup[] =
  demoSetup === 'a' ? [] : demoSetup === 'b' ? allDemoGroups.slice(0, 1) : demoSetup === 'c' ? allDemoGroups : allDemoGroups.slice(0, 2);

/*
 * Groups the demo's Find groups window lists (the "+" on the Feed): ones you
 * are not in yet, some near you (Wakefield), the rest elsewhere in Raleigh,
 * some open, some asking first. Joining one makes it yours, as on a real account.
 */
type Near = FeedGroup & { near: boolean };
const allDiscoverGroups: Near[] = [
  { ...wakeWed, near: true },
  { ...millbrook, near: true },
  { id: 'g-satmixed', name: 'Sat mixed · Wake Forest', look: { color: 'hard' }, description: 'Mixed doubles, new partner every set.', ask: false, near: true, createdAt: isoHoursAgo(24 * 18), members: crew('u-priya', 3, 9), requests: [] },
  { id: 'g-pullen', name: 'Pullen early hitters', look: { color: 'gold', ...photo('pullen') }, description: 'Rallies before work, some sets on Fridays.', ask: false, near: false, createdAt: isoHoursAgo(24 * 35), members: crew('u-marcus', 9, 8), requests: [] },
  { id: 'g-ncsu', name: 'NC State club tennis alumni', look: { color: 'red', ...photo('ncsu') }, description: 'Played club at State? Sunday singles and doubles.', ask: true, near: false, createdAt: isoHoursAgo(24 * 90), members: crew('u-theo', 0, 31), requests: [] },
  { id: 'g-lakelynn', name: 'Lake Lynn singles', look: { color: 'grass' }, description: 'Looking for a regular singles partner? Say when you can play.', ask: false, near: false, createdAt: isoHoursAgo(24 * 5), members: crew('u-omar', 14, 6), requests: [] },
];

const pick = (ids: string[]) => ids.map((id) => allDiscoverGroups.find((g) => g.id === id)).filter((g): g is Near => !!g);
export const demoDiscoverGroups: Near[] =
  demoSetup === 'a' ? []
  : demoSetup === 'b' ? pick(['g-wakewed', 'g-millbrook', 'g-satmixed', 'g-pullen', 'g-ncsu'])
  : demoSetup === 'c' ? pick(['g-satmixed', 'g-pullen', 'g-ncsu', 'g-lakelynn'])
  : allDiscoverGroups;

export const demoGroupPosts: Post[] = [
  {
    id: 'p-group-rrc-1',
    authorId: 'u-mira',
    kind: 'note',
    createdAt: isoHoursAgo(3),
    body: 'Courts 3 and 4 are ours from 7. The bubble is up if it rains.',
    likedBy: ['u-dev'],
    commentIds: [],
    tags: [],
    groupId: 'g-rrc',
  },
  {
    id: 'p-group-rrc-2',
    authorId: 'u-dev',
    kind: 'note',
    createdAt: isoHoursAgo(30),
    body: 'Good doubles today. We won the last set 6–4 and nobody is letting June forget that lob.',
    likedBy: [CURRENT_USER_ID, 'u-june'],
    commentIds: [],
    tags: [],
    groupId: 'g-rrc',
  },
  {
    id: 'p-group-wakewed-1',
    authorId: 'u-dev',
    kind: 'note',
    createdAt: isoHoursAgo(6),
    body: 'Wakefield High courts are free from 6:30. Four of us so far, who else?',
    likedBy: [],
    commentIds: [],
    tags: [],
    groupId: 'g-wakewed',
  },
];
