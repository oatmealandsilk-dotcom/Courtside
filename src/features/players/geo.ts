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
