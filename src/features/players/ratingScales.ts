/*
 * The two rating scales a player can give, with the plain-words level each
 * number stands for. Shared by the setup step and Edit Profile (Oct 5).
 */

export interface Scale {
  min: number;
  max: number;
  decimals: number;
  note: string;
  /** Sorted low to high: the first band the rating fits under describes it. */
  bands: { upTo: number; label: string }[];
}

export const SCALES: Record<'NTRP' | 'UTR', Scale> = {
  NTRP: {
    min: 1.5, max: 7.0, decimals: 1,
    note: 'USTA scale, 1.5–7.0 in half points.',
    bands: [
      { upTo: 2.5, label: 'Learning to rally' },
      { upTo: 3.0, label: 'Consistent at medium pace' },
      { upTo: 3.5, label: 'Dependable strokes' },
      { upTo: 4.0, label: 'Constructing points' },
      { upTo: 4.5, label: 'Pace and spin on demand' },
      { upTo: 5.0, label: 'A weapon and a plan' },
      { upTo: 5.5, label: 'Tournament standard' },
      { upTo: 7.0, label: 'Sectional and above' },
    ],
  },
  UTR: {
    min: 1.0, max: 16.5, decimals: 1,
    note: 'Universal Tennis Rating, to one decimal, as shown on your UTR profile.',
    bands: [
      { upTo: 2.0, label: 'Starting out' },
      { upTo: 4.0, label: 'Developing' },
      { upTo: 6.0, label: 'Club level' },
      { upTo: 8.0, label: 'Strong club / varsity' },
      { upTo: 10.0, label: 'Advanced junior / D3' },
      { upTo: 12.0, label: 'Division I' },
      { upTo: 14.0, label: 'Professional pathway' },
      { upTo: 16.5, label: 'Tour level' },
    ],
  },
};

/** A number rounded to a scale's decimals ("8.5", not "8.4999…"). */
export const roundRating = (n: number, decimals: number) => Number(n.toFixed(decimals));

/** The level words for a rating on its scale ("Club level"). */
export const ratingBand = (system: 'NTRP' | 'UTR', rating: number) =>
  (SCALES[system].bands.find((b) => rating <= b.upTo) ?? SCALES[system].bands[SCALES[system].bands.length - 1]).label;

