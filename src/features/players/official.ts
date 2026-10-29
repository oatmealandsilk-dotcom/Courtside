/**
 * CourtSide's own accounts (Oct 29, owner: "official check", and "can you make the courtside account not have to
 * show utr or nrtp"). An official account wears a small green check after its name wherever a player's name shows
 * (OfficialCheck), and never shows a rating: no level pill, no big number on its Tennis profile card. Everyone else
 * is untouched. A list in code for now (one account): if it grows, this becomes a column read at sign-in.
 */
export const OFFICIAL_IDS: ReadonlySet<string> = new Set([
  // @courtside
  '44ea8c4f-3b74-459b-994e-ff3d28598324',
]);

export const isOfficial = (id?: string | null): boolean => !!id && OFFICIAL_IDS.has(id);
