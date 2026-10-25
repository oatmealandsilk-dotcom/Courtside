/**
 * What a court is played on, from the map's own word for it (OpenStreetMap's
 * `surface` tag, kept in the courts table). The map has many words for one
 * kind: "asphalt", "acrylic", "concrete" and "decoturf" are all a hard court;
 * "sand" is the clay court of German and Dutch clubs (Sandplatz). Only about
 * one court in ten says anything (Oct 24: 27,845 of 258,890), and words that
 * say nothing about how it plays ("ground", "dirt",
 * "metal", "unpaved", a stray address) give no kind, so nothing is shown.
 */
export type SurfaceKind = 'hard' | 'clay' | 'grass' | 'turf' | 'carpet' | 'synthetic';

const HARD = new Set(['hard', 'hard_court', 'hardcourt', 'asphalt', 'paved', 'concrete', 'acrylic', 'decoturf', 'cement', 'plexipave', 'plexicushion', 'laykold', 'greenset', 'rebound_ace', 'tarmac', 'bitumen', 'macadam', 'porous_macadam', 'chipseal']);
const CLAY = new Set(['clay', 'artificial_clay', 'red_clay', 'green_clay', 'har-tru', 'hartru', 'har_tru', 'saibro', 'en_tout_cas', 'sand', 'brick', 'terre_battue']);
const GRASS = new Set(['grass']);
const TURF = new Set(['artificial_turf', 'artificial_grass', 'synthetic_turf', 'astroturf', 'turf']);
const CARPET = new Set(['carpet']);
const SYNTHETIC = new Set(['tartan', 'rubber', 'synthetic', 'plastic', 'rubbercrumb', 'synthetic_courts', 'polyurethane', 'pvc']);

/** The kind of court a map word names, or nothing when it does not say. */
export function surfaceKind(word: string | null | undefined): SurfaceKind | null {
  if (!word) return null;
  // "concrete:plates", "clay;asphalt": the first word says it.
  const w = word.trim().toLowerCase().split(/[;,]/)[0].split(':')[0].trim().replace(/\s+/g, '_');
  if (HARD.has(w)) return 'hard';
  if (CLAY.has(w)) return 'clay';
  if (GRASS.has(w)) return 'grass';
  if (TURF.has(w)) return 'turf';
  if (CARPET.has(w)) return 'carpet';
  if (SYNTHETIC.has(w)) return 'synthetic';
  return null;
}

/** The word on a tag: "Hard", "Clay", "Grass". */
export const surfaceLabel: Record<SurfaceKind, string> = { hard: 'Hard', clay: 'Clay', grass: 'Grass', turf: 'Turf', carpet: 'Carpet', synthetic: 'Synthetic' };

/** The word in a sentence: "8 hard courts". */
export const surfaceAdjective: Record<SurfaceKind, string> = { hard: 'hard', clay: 'clay', grass: 'grass', turf: 'turf', carpet: 'carpet', synthetic: 'synthetic' };
