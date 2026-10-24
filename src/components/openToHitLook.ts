/**
 * How the words under your own ring in Open to hit read (Oct 24, owner:
 * "Words here too jumbled. Especially the till midnight"). Three looks to
 * pick from; 'now' is the row as it was.
 * - A "One line": a green dot and "Till 12am ›" under your ring.
 * - B "You + time": "You" under your ring, the time a small pill on its edge.
 * - C "Tidy two lines": "You’re open" then a muted "till 12am ›".
 */
export type OpenLabels = 'now' | 'A' | 'B' | 'C';
export const OPEN_LABELS = 'now' as OpenLabels;
