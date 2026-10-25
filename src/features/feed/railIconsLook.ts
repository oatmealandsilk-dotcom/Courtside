/**
 * How the clip rail's icons are drawn: the heart, comment, share, save and
 * dots beside a clip or an Instant, and the small rail beside a clip on the
 * comments stage. Oct 24, owner, of those buttons: "Buttons aren't spaced
 * well. Also could be too thin and a bit too low." The spacing and the height
 * are fixed; this switch is the "too thin". 'now' is the rail exactly as it was.
 *
 *   'now'  today's outlines, lines about 1.6 to 1.9 pt, a crisp dark edge
 *   'A'    Bolder outline: the same shapes, every line 2.4 pt, the same crisp dark edge
 *   'B'    Filled: solid white shapes with a soft shadow, as TikTok's rail; a liked
 *          heart red, a saved bookmark the brand's bright green
 *
 * Drawn in components/RailGlyph.tsx.
 */
export type RailIconsLook = 'now' | 'A' | 'B';
export const RAIL_ICONS_LOOK: RailIconsLook = 'now';
