import type { LatLng } from '@/features/players/positions';

/** Straight-line distance between two spots, in miles. */
export function milesBetween(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "0.4 mi", "12 mi", "1,300 mi" — the way a phone says it. */
export function formatMiles(miles: number): string {
  if (miles < 0.15) return 'right here';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles).toLocaleString()} mi`;
}

/**
 * How far someone is, as finely as their pin allows. A rough pin (about a
 * kilometre out: map_players' 'approx', and every spot before migration
 * 63) is never said closer than "~1 mi", nor to a tenth of a mile.
 */
export function formatSpotMiles(miles: number, rough: boolean): string {
  if (!rough) return formatMiles(miles);
  if (miles < 1.5) return '~1 mi';
  if (miles < 10) return `${Math.round(miles)} mi`;
  return formatMiles(miles);
}

/**
 * The distance as formatSpotMiles says it, as a number, so a list can be
 * put in the order it reads ("~1 mi" never before "0.8 mi").
 */
export function spotMilesKey(miles: number, rough: boolean): number {
  if (rough) return miles < 1.5 ? 1 : Math.round(miles);
  if (miles < 0.15) return 0;
  return miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
}
