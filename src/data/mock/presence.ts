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
 * Where the demo's adults were last seen, as map_players (migration 63)
 * would show them to the demo player: Sam, Noor and Theo said "I'm playing
 * here" at Alder Park and Lena at Cypress Hollow, so they show on the court
 * itself (a stranger sees anyone on a court only while they are checked in
 * there); Omar follows you back, so he shows exactly where he was; everyone
 * else is about a kilometre out. Priya hides her activity, so her spot has no time. Up for a
 * hit today: Sam, Noor, Lena and Bea (`openUntil`, as their profiles say).
 * Never a row for Ella, the teen: the database shows a teen's spot only
 * to friends who follow each other with them (migration 78), and Ella and
 * the demo player don't, so the demo keeps that rule.
 */
export const demoLastSeen: Record<ID, LastSeen> = Object.fromEntries(([
  { userId: 'u-sam', ...atPark(1, 'Alder Park'), city: 'Los Angeles', seenAt: minutesAgo(12), openUntil: endOfToday() },
  { userId: 'u-noor', ...atPark(1, 'Alder Park'), city: 'Los Angeles', seenAt: minutesAgo(26), openUntil: endOfToday() },
  { userId: 'u-theo', ...atPark(1, 'Alder Park'), city: 'Los Angeles', seenAt: minutesAgo(41) },
  { userId: 'u-lena', ...atPark(3, 'Cypress Hollow Park'), city: 'Los Angeles', seenAt: minutesAgo(64), openUntil: endOfToday() },
  { userId: 'u-omar', lat: 34.0662, lng: -118.2431, place: 'exact', city: 'Los Angeles', seenAt: minutesAgo(190) },
  { userId: 'u-bea', lat: 34.05515, lng: -118.24677, place: 'approx', city: 'Los Angeles', seenAt: minutesAgo(130), openUntil: endOfToday() },
  { userId: 'u-marcus', lat: 34.07, lng: -118.23, place: 'approx', city: 'Los Angeles', seenAt: minutesAgo(120) },
  { userId: 'u-jonah', lat: 34.04812, lng: -118.26021, place: 'approx', city: 'Los Angeles', seenAt: minutesAgo(300) },
  { userId: 'u-ivy', lat: 34.04255, lng: -118.23488, place: 'approx', city: 'Los Angeles', seenAt: minutesAgo(1500) },
  { userId: 'u-diego', lat: 34.07951, lng: -118.26013, place: 'approx', city: 'Los Angeles', seenAt: minutesAgo(33) },
  { userId: 'u-priya', lat: 34.04, lng: -118.22, place: 'approx', city: 'Los Angeles' },
] satisfies LastSeen[]).map((r) => [r.userId, r]));
