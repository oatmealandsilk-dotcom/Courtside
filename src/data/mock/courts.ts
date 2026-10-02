import { milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { plain, wordStartIndex } from '@/features/search/words';

/**
 * Demo courts: eight made-up parks around the demo player's city (Los
 * Angeles, within about four kilometres of its centre), so the courts, their
 * pages and the map can be shown and photographed without the database or
 * the internet. Shaped like the courts table: one row per court, so a park
 * with four rows shows "4 courts". Six read as public parks; one reads as a
 * private club, to show public-looking courts listed first; one has no name,
 * the way OpenStreetMap leaves most courts. The ids look like the map's own
 * ("way…"), so notes, tags and hits treat them as real courts.
 */
export interface DemoCourtRow { id: string; name: string | null; lat: number; lng: number; lit: boolean | null; surface: string | null }

const park = (n: number, name: string | null, lat: number, lng: number, courts: number, lit: boolean, surface: string | null): DemoCourtRow[] => {
  // A park's courts stand a few metres apart: the same ~250 m cell, so the map folds them into one pin with a count.
  const spots = [[0, 0], [0.0003, 0.0002], [-0.0003, 0.0002], [0.0002, -0.0004], [-0.0002, -0.0004], [0.0004, 0.0005]];
  return spots.slice(0, courts).map(([dLat, dLng], i) => ({
    id: `way9${String(n).padStart(3, '0')}${String(i + 1).padStart(6, '0')}`,
    name,
    lat: Number((lat + dLat).toFixed(5)),
    lng: Number((lng + dLng).toFixed(5)),
    lit: lit || null,
    surface,
  }));
};

export const DEMO_COURT_ROWS: DemoCourtRow[] = [
  ...park(1, 'Alder Park', 34.0604, -118.254, 4, true, 'hard'),
  ...park(2, 'Bellwood Recreation Center', 34.0406, -118.221, 2, false, 'hard'),
  ...park(3, 'Cypress Hollow Park', 34.0736, -118.23, 6, true, 'hard'),
  ...park(4, 'Marigold Park', 34.034, -118.26, 1, false, 'hard'),
  ...park(5, 'Juniper Community Park', 34.0868, -118.245, 3, false, 'clay'),
  ...park(6, 'Larkspur Recreation Center', 34.0186, -118.233, 2, false, 'hard'),
  ...park(7, 'Hillcrest Tennis Club', 34.056, -118.212, 5, false, 'clay'),
  ...park(8, null, 34.045, -118.248, 2, false, null),
];

/** The first court of each demo park, the one its pin and page stand for: parks 1 and 3 hold the demo hits and posts. */
export const DEMO_PARK = (n: number) => DEMO_COURT_ROWS.find((r) => r.id.startsWith(`way9${String(n).padStart(3, '0')}`))!;

/** Demo courts within a radius of a spot, the way the courts function answers. */
export function demoCourtsNear(center: LatLng, radiusMeters: number): DemoCourtRow[] {
  const reach = radiusMeters / 1609.34;
  return DEMO_COURT_ROWS.filter((r) => milesBetween(center, r) <= reach);
}

/** Demo courts with a word in their name starting with `word` ("cyp" finds Cypress Hollow Park), the way the name search does. */
export function demoCourtsNamed(word: string): DemoCourtRow[] {
  const w = plain(word);
  if (w.length < 2) return [];
  return DEMO_COURT_ROWS.filter((r) => !!r.name && wordStartIndex(plain(r.name), w) >= 0);
}
