import type { ID, LastSeen } from '../types';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Where the demo's adults last had Location on, to about a kilometre (two
 * decimals), each near a demo park, so the map has players on it. Sam was
 * there 12 minutes ago, Marcus two hours ago; Priya hides her activity, so
 * her spot has no time. Never a row for Ella, the teen: the database never
 * shows an adult a teen's spot (migration 46), and the demo keeps that rule.
 */
export const demoLastSeen: Record<ID, LastSeen> = {
  'u-sam': { userId: 'u-sam', lat: 34.06, lng: -118.25, city: 'Los Angeles', seenAt: minutesAgo(12) },
  'u-marcus': { userId: 'u-marcus', lat: 34.07, lng: -118.23, city: 'Los Angeles', seenAt: minutesAgo(120) },
  'u-priya': { userId: 'u-priya', lat: 34.04, lng: -118.22, city: 'Los Angeles' },
};
