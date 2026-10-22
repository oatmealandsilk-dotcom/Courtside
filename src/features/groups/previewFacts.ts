import { demoDiscoverGroups, demoGroups } from '@/data/mock/groups';
import type { ID } from '@/data/types';

/*
 * Design preview only (Oct 22, Groups sheet looks D and E): the tennis facts
 * a player would say out loud about a demo group (where, when, what level,
 * and who is in it). None of this is stored for a
 * real group yet: it would need courts / usual times / level fields on a
 * group (a migration), and Find groups would have to return the people you
 * follow in each group. Until then a real group shows its member count.
 */

export type GroupFacts = { place?: string; when?: string; level?: string };

// Said the way a player texts it: short times ("Wed 6:30p"), an NTRP level or range. No "any day".
const FACTS: Record<ID, GroupFacts> = {
  'g-rrc': { place: 'Raleigh Racquet Club', when: 'Tue + Thu 7p', level: '3.5–4.5' },
  'g-wakewed': { place: 'Wakefield High', when: 'Wed 6:30p', level: '3.0–3.5' },
  'g-millbrook': { place: 'Millbrook Exchange', level: 'NTRP 4.0' },
  'g-satmixed': { when: 'Sat 9a', level: '3.0–4.0' },
  'g-pullen': { place: 'Pullen Park', when: 'M/W/F 6:15a', level: 'All levels' },
  'g-ncsu': { when: 'Sun 10a', level: '4.0–5.0' },
  'g-lakelynn': { place: 'Lake Lynn', level: 'NTRP 3.5' },
};

export const factsFor = (id: ID): GroupFacts | undefined => FACTS[id];

/**
 * "Wed 6:30p · 3.0–3.5 · Wakefield High": when, then level, then the place
 * only if the whole line still fits in about `room` characters, so a line is
 * never cut off mid-word ("Wed 6:…"). Nothing when the group has no facts.
 */
export const factLine = (id: ID, room = 32): string => {
  const f = FACTS[id];
  if (!f) return '';
  const core = [f.when, f.level].filter(Boolean).join(' · ');
  if (!f.place) return core;
  const withPlace = core ? `${core} · ${f.place}` : f.place;
  return withPlace.length <= room || !core ? withPlace : core;
};

/** The people in a demo group the list may show (never on a real account, where Find groups returns only a count). */
export const facesFor = (id: ID): ID[] => {
  const g = demoGroups.find((x) => x.id === id) ?? demoDiscoverGroups.find((x) => x.id === id);
  return g ? [...new Set(g.members.map((m) => m.id))] : [];
};

/** The demo lives in Wakefield, Raleigh: its sections say so. A real account says "Near you" / "More groups". */
export const areaWords = (demo: boolean) => (demo ? { near: 'Near Wakefield', more: 'More in Raleigh' } : { near: 'Near you', more: 'More groups' });
