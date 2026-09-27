import type { CourtNote } from '@/data/types';

export const SURFACE_LABEL: Record<NonNullable<CourtNote['surface']>, string> = { hard: 'Hard', clay: 'Clay', grass: 'Grass', other: 'Other' };
export const NETS_LABEL: Record<NonNullable<CourtNote['nets']>, string> = { good: 'Good', worn: 'Worn', missing: 'Missing' };
export const BUSY_LABEL: Record<NonNullable<CourtNote['busy']>, string> = { quiet: 'Usually free', wait: 'Sometimes a wait', busy: 'Usually busy' };

/** The answer most players gave; a tie goes to the most recent (notes arrive newest first). */
function most<T>(values: (T | undefined)[]): T | undefined {
  const tally = new Map<T, number>();
  for (const v of values) if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best: { value: T; count: number } | undefined;
  for (const [value, count] of tally) if (!best || count > best.count) best = { value, count };
  return best?.value;
}

/** What players say about a court, in a line of facts: "Lights · Hard · Nets worn · Sometimes a wait". */
export function summarizeCourt(notes: CourtNote[]) {
  const lights = most(notes.map((n) => n.lights));
  const surface = most(notes.map((n) => n.surface));
  const nets = most(notes.map((n) => n.nets));
  const busy = most(notes.map((n) => n.busy));
  const facts: { icon: 'bulb-outline' | 'layers-outline' | 'grid-outline' | 'people-outline'; label: string }[] = [];
  if (lights !== undefined) facts.push({ icon: 'bulb-outline', label: lights ? 'Lights' : 'No lights' });
  if (surface) facts.push({ icon: 'layers-outline', label: SURFACE_LABEL[surface] });
  if (nets) facts.push({ icon: 'grid-outline', label: `Nets ${NETS_LABEL[nets].toLowerCase()}` });
  if (busy) facts.push({ icon: 'people-outline', label: BUSY_LABEL[busy] });
  return {
    facts,
    photos: notes.flatMap((n) => (n.photoUrl ? [n.photoUrl] : [])).slice(0, 6),
    latest: notes.find((n) => n.note)?.note,
    players: notes.length,
  };
}
