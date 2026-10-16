/*
 * Heart-rate zones for an Apple Health workout (Oct 15, owner: his brother's
 * Apple Watch sessions never offered the Heart rate share design). Health
 * hands over no zone times, only the beats themselves, which the phone
 * already reads for each workout's average and top heart rate
 * (features/health/appleHealth.ts). So the zone minutes are worked out here,
 * from those same readings, with no new permission.
 *
 * The zones are the ones the app already draws (zones.ts, ZONE_NAMES) as
 * WHOOP counts them: a share of the player's maximum heart rate, Easy below
 * 60% (WHOOP's zone 0 folded in, as the server does for WHOOP), Light 60–70%,
 * Moderate 70–80%, Hard 80–90%, Peak 90% and over. The maximum is the usual
 * estimate from age (Tanaka: 208 − 0.7 × age) when the app knows the
 * player's birthday; otherwise a 30-year-old's (187), or a 16-year-old's for
 * a teen account (197). General training information, not medical advice.
 *
 * Each reading counts until the next one (a Watch reads about every five
 * seconds during a workout), at most two minutes, so a stretch the Watch was
 * off is never counted as anything. Time outside the workout is never
 * counted. The minutes are whole, rounded so they add up to the whole
 * minutes counted (never more than the workout's own), and nothing at all
 * when under half the workout was heard: the server drops a strap's heart
 * rate the same way (migration 65).
 *
 * Pure: no Health, no clock, so it can be tried on made-up readings.
 */

/** One heart-rate reading: when (ms since 1970) and how fast. */
export interface BeatSample { at: number; bpm: number }

/** The bottom of zones 2 to 5, as a share of the maximum heart rate (WHOOP's: 60, 70, 80, 90%). */
export const ZONE_FLOORS = [0.6, 0.7, 0.8, 0.9] as const;

/** Longest a single reading counts for: a gap longer than this is the Watch not hearing. */
export const MAX_GAP_MS = 2 * 60_000;

/** The age taken when the app does not know the birthday: an adult's, and a teen account's. */
export const DEFAULT_ZONE_AGE = 30;
export const TEEN_ZONE_AGE = 16;

/** The usual estimate of maximum heart rate from age (Tanaka, 208 − 0.7 × age), whole beats. */
export function estimatedMaxHr(age?: number | null, teen = false): number {
  const years = typeof age === 'number' && Number.isFinite(age) && age >= 8 && age <= 100 ? age : teen ? TEEN_ZONE_AGE : DEFAULT_ZONE_AGE;
  return Math.round(208 - 0.7 * years);
}

/** Which zone a beat is in, 0 (Easy) to 4 (Peak). */
export function zoneOf(bpm: number, maxHr: number): number {
  const f = bpm / maxHr;
  let z = 0;
  for (const floor of ZONE_FLOORS) if (f >= floor) z += 1;
  return z;
}

/**
 * Whole minutes summing to the rounded total, each as near its own share as
 * can be: every zone rounded down, then the minutes left over go to the
 * zones with the biggest part of a minute dropped.
 */
export function wholeMinutes(ms: number[]): number[] {
  const mins = ms.map((v) => v / 60_000);
  const out = mins.map(Math.floor);
  const target = Math.round(mins.reduce((a, b) => a + b, 0));
  let left = target - out.reduce((a, b) => a + b, 0);
  const order = mins.map((m, i) => ({ i, part: m - Math.floor(m) })).sort((a, b) => b.part - a.part || b.i - a.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * Minutes in each zone, easiest first ([Easy, Light, Moderate, Hard, Peak]),
 * for a workout from `startMs` to `endMs`; null when the readings cover
 * under half of it, or come to under a minute.
 */
export function appleZones(samples: BeatSample[], startMs: number, endMs: number, maxHr: number): number[] | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !(maxHr >= 100 && maxHr <= 250)) return null;
  const beats = samples
    .filter((s) => Number.isFinite(s.at) && Number.isFinite(s.bpm) && s.bpm >= 30 && s.bpm <= 250 && s.at >= startMs - MAX_GAP_MS && s.at <= endMs)
    .sort((a, b) => a.at - b.at);
  if (!beats.length) return null;
  const ms = [0, 0, 0, 0, 0];
  for (let i = 0; i < beats.length; i += 1) {
    const b = beats[i];
    const next = i + 1 < beats.length ? beats[i + 1].at : endMs;
    // From this reading to the next (at most two minutes), inside the workout only.
    // The first reading also stands for the moments before it, within the same two minutes.
    const from = Math.max(startMs, i === 0 ? b.at - MAX_GAP_MS : b.at);
    const to = Math.min(endMs, next, b.at + MAX_GAP_MS);
    if (to > from) ms[zoneOf(b.bpm, maxHr)] += to - from;
  }
  const heard = ms.reduce((a, b) => a + b, 0);
  if (heard < 0.5 * (endMs - startMs)) return null;
  const out = wholeMinutes(ms);
  return out.some((v) => v > 0) ? out : null;
}
