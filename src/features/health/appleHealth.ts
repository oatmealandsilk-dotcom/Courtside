import { Platform } from 'react-native';

import type { DailyHealth } from '@/data/types';

/** A day of body numbers from the Health app. */
export type BodyDay = Pick<DailyHealth, 'date'> & Partial<Pick<DailyHealth, 'restingHeartRate' | 'hrvMs' | 'sleepHours' | 'steps' | 'calories'>>;

/*
 * Apple Health lives in HealthKit, which only the real app (the App Store
 * or TestFlight build) carries — Expo Go cannot. The module is loaded on
 * demand so the app still runs where it is missing; `available()` says
 * which world we are in.
 */
type Sample = { startDate: string; endDate: string; value: number };
/** One workout as the library hands it over (RCTAppleHealthKit+Queries.m, the workout branch of fetchSamplesOfType). */
type AppleWorkout = { id: string; activityId: number; activityName: string; calories: number; start: string; end: string; sourceName: string; sourceId: string; device: string; tracked: boolean };
type HrSample = { value: number; startDate: string; endDate: string; sourceId?: string; sourceName?: string };
type HK = {
  initHealthKit: (perms: { permissions: { read: string[]; write: string[] } }, cb: (err: string | null) => void) => void;
  getDailyStepCountSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getActiveEnergyBurned: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getHeartRateVariabilitySamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getRestingHeartRateSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getSleepSamples: (o: object, cb: (err: string | null, r: (Sample & { value: unknown })[]) => void) => void;
  getEnergyConsumedSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getProteinSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getCarbohydratesSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getTotalFatSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getSamples: (o: object, cb: (err: string | null, r: AppleWorkout[]) => void) => void;
  getHeartRateSamples: (o: object, cb: (err: string | null, r: HrSample[]) => void) => void;
  Constants: { Permissions: Record<string, string> };
};

let hk: HK | null | undefined;
function load(): HK | null {
  if (hk !== undefined) return hk;
  if (Platform.OS !== 'ios') { hk = null; return hk; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health') as { default?: HK } & HK;
    const m = mod.default ?? mod;
    hk = typeof m?.initHealthKit === 'function' ? m : null;
  } catch {
    hk = null;
  }
  return hk;
}

export const appleHealthAvailable = () => load() !== null;

const call = <T,>(fn: (cb: (err: string | null, r: T) => void) => void) => new Promise<T>((res, rej) => fn((err, r) => (err ? rej(new Error(err)) : res(r))));

/**
 * Asks once for read access. Throws when refused or when HealthKit is not in this build.
 * `workouts` adds workouts and heart rate, for tennis sessions: asked only
 * from the tennis buttons, after CourtSide has said why (migration 58).
 */
export async function connectAppleHealth(opts: { workouts?: boolean } = {}): Promise<void> {
  const h = load();
  if (!h) throw new Error('Apple Health is not available in this version of CourtSide.');
  const P = h.Constants.Permissions;
  const read = [P.Steps, P.StepCount, P.ActiveEnergyBurned, P.HeartRateVariability, P.RestingHeartRate, P.SleepAnalysis, P.EnergyConsumed, P.Protein, P.Carbohydrates, P.FatTotal, ...(opts.workouts ? [P.Workout, P.HeartRate] : [])].filter(Boolean);
  await new Promise<void>((res, rej) => h.initHealthKit({ permissions: { read, write: [] } }, (err) => (err ? rej(new Error(err)) : res())));
}

/** The library writes '+0100' with no colon, which not every date parser takes. */
const isoOf = (s: string) => new Date(s.replace(/([+-][0-9]{2})([0-9]{2})$/, '$1:$2')).toISOString();

/** A tennis workout from Health, with its heart rate read over the same minutes. */
export type TennisWorkout = { id: string; startedAt: string; endedAt: string; minutes: number; kcal?: number; avgHr?: number; maxHr?: number; device?: string; tzOffsetMin: number };

/**
 * Tennis workouts saved to Health since a moment, newest first, at most 10.
 * `skipWhoop` leaves out the ones the WHOOP app copied into Health, when
 * WHOOP already sends its own straight to the server. Never throws.
 */
export async function readTennisWorkouts(sinceIso: string, opts: { skipWhoop?: boolean } = {}): Promise<TennisWorkout[]> {
  const h = load();
  if (!h) return [];
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  try {
    // getSamples, not getAnchoredWorkouts: the anchored query drops any workout saved without metadata.
    const all = await settle(call<AppleWorkout[]>((cb) => h.getSamples({ type: 'Workout', startDate: sinceIso, endDate: new Date().toISOString(), ascending: false }, cb)));
    // 48 is HKWorkoutActivityType.tennis.
    const tennis = (all ?? [])
      .filter((w) => w.activityId === 48 || w.activityName === 'Tennis')
      .filter((w) => !opts.skipWhoop || !/whoop/i.test(`${w.sourceName} ${w.sourceId}`))
      .slice(0, 10);
    const out: TennisWorkout[] = [];
    for (const w of tennis) {
      // A workout with an unreadable time is skipped on its own, not with the rest.
      let startedAt: string;
      let endedAt: string;
      try { startedAt = isoOf(w.start); endedAt = isoOf(w.end); } catch { continue; }
      const hr = await settle(call<HrSample[]>((cb) => h.getHeartRateSamples({ startDate: w.start, endDate: w.end, ascending: true }, cb)));
      // The workout's own watch first; any other source's beats only when it saved none.
      const own = (hr ?? []).filter((s) => s.sourceId === w.sourceId);
      const vals = (own.length ? own : hr ?? []).map((s) => s.value).filter((v) => v >= 30 && v <= 250);
      out.push({
        id: w.id,
        startedAt,
        endedAt,
        minutes: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
        kcal: w.calories > 0 ? Math.round(w.calories) : undefined,
        maxHr: vals.length ? Math.round(Math.max(...vals)) : undefined,
        avgHr: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined,
        device: w.device || w.sourceName || undefined,
        tzOffsetMin: -new Date(startedAt).getTimezoneOffset(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** The last `days` days, newest first. Missing numbers stay missing. */
export async function readAppleHealth(days = 7): Promise<BodyDay[]> {
  const h = load();
  if (!h) return [];
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const out = new Map<string, BodyDay>();
  const at = (date: string) => { const have = out.get(date) ?? { date }; out.set(date, have); return have; };
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };

  const steps = await settle(call<Sample[]>((cb) => h.getDailyStepCountSamples(range, cb)));
  for (const s of steps ?? []) at(dayOf(s.startDate)).steps = Math.round(s.value);
  const energy = await settle(call<Sample[]>((cb) => h.getActiveEnergyBurned({ ...range, ascending: true }, cb)));
  for (const s of energy ?? []) { const d = at(dayOf(s.startDate)); d.calories = Math.round((d.calories ?? 0) + s.value); }
  const hrv = await settle(call<Sample[]>((cb) => h.getHeartRateVariabilitySamples(range, cb)));
  const hrvBy = new Map<string, number[]>();
  for (const s of hrv ?? []) hrvBy.set(dayOf(s.startDate), [...(hrvBy.get(dayOf(s.startDate)) ?? []), s.value * 1000]);
  for (const [d, v] of hrvBy) at(d).hrvMs = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  const rhr = await settle(call<Sample[]>((cb) => h.getRestingHeartRateSamples(range, cb)));
  for (const s of rhr ?? []) at(dayOf(s.startDate)).restingHeartRate = Math.round(s.value);
  const sleep = await settle(call<(Sample & { value: unknown })[]>((cb) => h.getSleepSamples(range, cb)));
  for (const s of sleep ?? []) {
    const v = String(s.value).toUpperCase();
    if (v === 'INBED' || v === 'AWAKE') continue;
    // A night belongs to the day you wake up on.
    const d = at(dayOf(s.endDate));
    d.sleepHours = Math.round(((d.sleepHours ?? 0) + (Date.parse(s.endDate) - Date.parse(s.startDate)) / 3_600_000) * 10) / 10;
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** A day of what was eaten, as a food app wrote it into Health. */
export type FoodDay = Pick<DailyHealth, 'date'> & Partial<Pick<DailyHealth, 'calories' | 'proteinGrams' | 'carbGrams' | 'fatGrams'>>;

/**
 * What MyFitnessPal or Cronometer logged, read from Health: both apps write
 * each meal's calories, protein, carbs and fat there once their own "share
 * with Apple Health" switch is on. Summed per day, newest first.
 */
export async function readAppleNutrition(days = 14): Promise<FoodDay[]> {
  const h = load();
  if (!h) return [];
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const out = new Map<string, FoodDay>();
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  const add = (rows: Sample[] | null, key: 'calories' | 'proteinGrams' | 'carbGrams' | 'fatGrams') => {
    for (const r of rows ?? []) {
      const d = out.get(dayOf(r.startDate)) ?? { date: dayOf(r.startDate) };
      d[key] = Math.round((d[key] ?? 0) + r.value);
      out.set(d.date, d);
    }
  };
  add(await settle(call<Sample[]>((cb) => h.getEnergyConsumedSamples(range, cb))), 'calories');
  add(await settle(call<Sample[]>((cb) => h.getProteinSamples(range, cb))), 'proteinGrams');
  add(await settle(call<Sample[]>((cb) => h.getCarbohydratesSamples(range, cb))), 'carbGrams');
  add(await settle(call<Sample[]>((cb) => h.getTotalFatSamples(range, cb))), 'fatGrams');
  return [...out.values()].filter((d) => (d.calories ?? 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}
