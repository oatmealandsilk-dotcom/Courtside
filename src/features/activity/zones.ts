import type { SessionDetail } from '@/data/types';
import { colors, pageIsDark, withAlpha } from '@/theme';

/*
 * Heart-rate zones: how long a session spent in each of five zones, as WHOOP
 * counts them (migration 65). Stored easiest first, [zone 1 … zone 5]; shown
 * hardest first, Peak at the top. The names are CourtSide's own words, not
 * WHOOP's. WHOOP's zone 0 is already folded into Easy by the server.
 */

/** Hardest first, as the rows read: zone number and our word for it. */
export const ZONE_NAMES: { n: number; name: string }[] = [
  { n: 5, name: 'Peak' },
  { n: 4, name: 'Hard' },
  { n: 3, name: 'Moderate' },
  { n: 2, name: 'Light' },
  { n: 1, name: 'Easy' },
];

/** Five whole, sensible minute counts, or nothing: anything else is never drawn. */
export function cleanZones(z: unknown): number[] | null {
  if (!Array.isArray(z) || z.length !== 5) return null;
  const out = z.map((v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600 ? Math.round(v) : NaN));
  if (out.some((v) => Number.isNaN(v)) || out.every((v) => v === 0)) return null;
  return out;
}

/**
 * The zones a post may show: only from a tracker, only with its heart rate
 * shown (so only an adult who switched it on), and only five clean numbers.
 * A hand-logged post never has any, whatever it carries.
 */
export function postZones(s: SessionDetail | undefined): number[] | null {
  if (!s || !s.activityId || s.maxHr == null) return null;
  return cleanZones(s.zones);
}

/** "Zones 4–5": minutes in Hard and Peak together. */
export const hardMinutes = (z: number[]) => (z[3] ?? 0) + (z[4] ?? 0);

/** `t` of the way from one #RRGGBB colour to another. */
export function mixHex(a: string, b: string, t: number): string {
  const ok = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  if (!ok(a) || !ok(b)) return a;
  const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The five fills, easiest first, for where they are drawn:
 * - 'page': on the page or a sheet. Easy and Light are the text colour, faint;
 *   Moderate to Peak run up to the brand colour: mixed from the surface on a
 *   light page, the brand at rising strength on a dark one (New York's
 *   yellow never goes olive, and its steps stay apart).
 * - 'brand': on a card filled with the brand colour: its ink, stronger by zone.
 * - 'media': over a photo, in white rising to the brand colour.
 * Read as the screen draws, so each theme gets its own.
 */
export function zoneColors(on: 'page' | 'brand' | 'media'): string[] {
  if (on === 'brand') return [0.22, 0.36, 0.52, 0.74, 1].map((a) => withAlpha(colors.brandInk, a));
  if (on === 'media') return ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.55)', mixHex('#FFFFFF', colors.brand, 0.6), mixHex('#FFFFFF', colors.brand, 0.85), colors.brand];
  // On a dark page the brand colour is laid over the page at rising strength
  // (40%, 68%, full), so Moderate, Hard and Peak step clearly apart; a mix
  // from the pale text made Hard look almost the same as Peak.
  if (pageIsDark()) return [withAlpha(colors.text, 0.13), withAlpha(colors.text, 0.24), withAlpha(colors.brand, 0.4), withAlpha(colors.brand, 0.68), colors.brand];
  return [withAlpha(colors.text, 0.13), withAlpha(colors.text, 0.24), mixHex(colors.surface, colors.brand, 0.46), mixHex(colors.surface, colors.brand, 0.74), colors.brand];
}
