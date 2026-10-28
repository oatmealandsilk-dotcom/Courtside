import type { ID, LastSeen } from '../types';
import { DEMO_PARK } from './courts';
import { endOfToday } from '@/features/players/openToHit';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** On a demo court, the way map_players (migration 63) snaps someone there: the court's own spot, with its name. */
const atPark = (n: number, name: string) => {
  const c = DEMO_PARK(n);
  return { lat: c.lat, lng: c.lng, place: 'court' as const, courtId: c.id, courtName: name };
};

/**
 * The demo player's friends on the map, as map_players (migration 189)
 * would show them: only friends who follow each other with you, only while
 * their Check in lasts (until 10pm), never a stranger. Sam and Marcus said
 * "I'm playing here" at Alder Park, so they show on the court itself (Sam up
 * for a hit today); Omar at Bellwood, on his own (one friend: a warm court). Everyone
 * else in the demo is a stranger to you, so their spots never reach the
 * phone: they show only through a court they chose (an open hit, a count of
 * who is playing). Never a row for Ella, the teen.
 */
export const demoLastSeen: Record<ID, LastSeen> = Object.fromEntries(([
  { userId: 'u-sam', ...atPark(1, 'Alder Park'), city: 'Los Angeles', seenAt: minutesAgo(12), openUntil: endOfToday(), mutual: true },
  { userId: 'u-omar', ...atPark(2, 'Bellwood Recreation Center'), city: 'Los Angeles', seenAt: minutesAgo(48), mutual: true },
  { userId: 'u-marcus', ...atPark(1, 'Alder Park'), city: 'Los Angeles', seenAt: minutesAgo(25), mutual: true },
] satisfies LastSeen[]).map((r) => [r.userId, r]));
