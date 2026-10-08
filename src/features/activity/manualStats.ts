/*
 * Calories and average heart rate typed in by hand (Oct 8, owner: "yes add
 * it"), on a session logged without a tracker: Log a session, and the "Log
 * it" page that Finish opens for a timed session. Both are optional and
 * tucked behind "+ Add calories & heart rate", so logging stays two taps.
 * The limits are the database's own (migration 154), so nothing typed here
 * can look saved and then not be. Plain functions with no app imports, so
 * they can be checked on their own.
 */

/** What the database keeps: calories 1–3000, average heart rate 40–220 bpm. */
export const KCAL_MIN = 1;
export const KCAL_MAX = 3000;
export const AVG_HR_MIN = 40;
export const AVG_HR_MAX = 220;

/** Only the digits of what was typed, at most `max` of them (a pasted "450 kcal" keeps 450). */
export const digitsOnly = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

export interface ManualRead {
  kcal?: number;
  avgHr?: number;
  /** Why what was typed can't be saved yet, in a sentence; nothing when it can (or nothing was typed). */
  problem?: string;
  /** Which box the problem is in, so only that one is called out. */
  problemIn?: 'kcal' | 'hr';
}

/**
 * The two boxes as numbers, or why not. Empty boxes are simply left out:
 * either can be given without the other.
 */
export function readManualStats(kcalText: string, hrText: string): ManualRead {
  const kcal = kcalText.trim() ? Number(kcalText.trim()) : undefined;
  const avgHr = hrText.trim() ? Number(hrText.trim()) : undefined;
  if (kcal !== undefined && !(Number.isInteger(kcal) && kcal >= KCAL_MIN && kcal <= KCAL_MAX)) {
    return { problem: `Calories go from ${KCAL_MIN} to ${KCAL_MAX.toLocaleString('en-US')}.`, problemIn: 'kcal' };
  }
  if (avgHr !== undefined && !(Number.isInteger(avgHr) && avgHr >= AVG_HR_MIN && avgHr <= AVG_HR_MAX)) {
    return { problem: `Average heart rate goes from ${AVG_HR_MIN} to ${AVG_HR_MAX} bpm.`, problemIn: 'hr' };
  }
  return { ...(kcal !== undefined ? { kcal } : {}), ...(avgHr !== undefined ? { avgHr } : {}) };
}

/** A number read back from the database or a saved copy, kept only when it is inside the limits. */
export function keptKcal(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= KCAL_MIN && n <= KCAL_MAX ? n : undefined;
}
export function keptAvgHr(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= AVG_HR_MIN && n <= AVG_HR_MAX ? n : undefined;
}
