import { demoDiscoverGroups, demoGroups } from '@/data/mock/groups';
import type { ID } from '@/data/types';

/*
 * Design preview only (Oct 22, Groups sheet looks D and E): the tennis facts
 * a player would say out loud about a demo group (where, when, what level,
 * how many hits this week) and who is in it. None of this is stored for a
 * real group yet: it would need courts / usual times / level fields on a
 * group (a migration), and Find groups would have to return the people you
 * follow in each group. Until then a real group shows its member count.
 */

export type GroupFacts = { place?: string; when?: string; level?: string; hitsThisWeek?: number };

const FACTS: Record<ID, GroupFacts> = {
  'g-rrc': { place: 'Raleigh Racquet Club', when: 'Tue + Thu 7pm', level: '3.5–4.5', hitsThisWeek: 9 },
  'g-wakewed': { place: 'Wakefield High School', when: 'Wed 6:30pm', level: '3.0–3.5', hitsThisWeek: 6 },
  'g-millbrook': { place: 'Millbrook Exchange', when: 'any day', level: '4.0', hitsThisWeek: 14 },
  'g-satmixed': { when: 'Sat 9am', level: '3.0–4.0', hitsThisWeek: 4 },
  'g-pullen': { place: 'Pullen Tennis Center', when: 'Mon/Wed/Fri 6:15am', level: 'all levels', hitsThisWeek: 7 },
  'g-ncsu': { when: 'Sun 10am', level: '4.0–5.0', hitsThisWeek: 11 },
  'g-lakelynn': { place: 'Lake Lynn', level: '3.5', hitsThisWeek: 2 },
};

export const factsFor = (id: ID): GroupFacts | undefined => FACTS[id];

/** "Millbrook Exchange · Thu 6pm · 3.5–4.0", or nothing when the group has no facts. */
export const factLine = (id: ID): string => {
  const f = FACTS[id];
  return f ? [f.place, f.when, f.level].filter(Boolean).join(' · ') : '';
};

/** The people in a demo group the list may show (never on a real account, where Find groups returns only a count). */
export const facesFor = (id: ID): ID[] => {
  const g = demoGroups.find((x) => x.id === id) ?? demoDiscoverGroups.find((x) => x.id === id);
  return g ? [...new Set(g.members.map((m) => m.id))] : [];
};

/** The demo lives in Wakefield, Raleigh: its sections say so. A real account says "Near you" / "More groups". */
export const areaWords = (demo: boolean) => (demo ? { near: 'Near Wakefield', more: 'More in Raleigh' } : { near: 'Near you', more: 'More groups' });

/** A cover (the wide crop of a group's court photo) for look E, next to its square face. */
export const coverFor = (photoUrl?: string) => (photoUrl && photoUrl.includes('/preview-covers/') ? photoUrl.replace('-square', '-wide') : undefined);
