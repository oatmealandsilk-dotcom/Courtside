import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import type { DailyHealth } from '@/data/types';
import { slugOfAppleWorkout } from '@/features/activity/workouts';

/** A day of body numbers from the Health app. */
export type BodyDay = Pick<DailyHealth, 'date'> & Partial<Pick<DailyHealth, 'restingHeartRate' | 'hrvMs' | 'sleepHours' | 'steps' | 'calories'>>;

/*
 * Apple Health lives in HealthKit, which only the real app (the App Store
 * or TestFlight build) carries — Expo Go cannot. The module is loaded on
 * demand so the app still runs where it is missing; `available()` says
 * which world we are in.
 */
type Sample = { startDate: string; endDate: string; value: number };
type SourcedSample = Sample & { sourceName?: string; sourceId?: string };
/** One workout as the library hands it over (RCTAppleHealthKit+Queries.m, the workout branch of fetchSamplesOfType). */
type AppleWorkout = { id: string; activityId: number; activityName: string; calories: number; start: string; end: string; sourceName: string; sourceId: string; device: string; tracked: boolean; distance?: number; metadata?: unknown };
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
/** The phone's own HealthKit module, when this build carries it (see load). */
function nativeHealthKit(): object | null {
  const usable = (m: unknown) => (m && typeof (m as Partial<HK>).initHealthKit === 'function' ? (m as object) : null);
  try {
    return usable(NativeModules.AppleHealthKit) ?? usable(TurboModuleRegistry.get('AppleHealthKit'));
  } catch {
    return null;
  }
}
/**
 * Under React Native's new architecture (on since SDK 52) a native module
 * reaches JavaScript as an empty object whose methods are looked up through
 * its prototype. The library's index copies the module with Object.assign,
 * which only copies an object's own properties, so its export came out with
 * no initHealthKit at all and the app thought HealthKit was missing even in
 * the App Store build. So the methods are read straight off the native
 * module, and only the library's constants (plain JavaScript) come from it.
 */
function load(): HK | null {
  if (hk !== undefined) return hk;
  if (Platform.OS !== 'ios') { hk = null; return hk; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health') as { default?: HK } & HK;
    const m = mod.default ?? mod;
    const native = nativeHealthKit();
    const constants = m?.Constants;
    if (native && constants) hk = Object.assign(Object.create(native) as HK, { Constants: constants });
    else hk = typeof m?.initHealthKit === 'function' ? m : null;
  } catch {
    hk = null;
  }
  return hk;
}

export const appleHealthAvailable = () => load() !== null;

/** Expo Go on an iPhone: HealthKit can never be there, only in the App Store build. */
export const inExpoGo = () => Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const call = <T,>(fn: (cb: (err: string | null, r: T) => void) => void) => new Promise<T>((res, rej) => fn((err, r) => (err ? rej(new Error(err)) : res(r))));

/**
 * Asks once for read access. Throws when refused or when HealthKit is not in this build.
 * `workouts` adds workouts and heart rate, for tennis sessions and (since
 * Oct 5) every other workout: asked only from the Health page's buttons,
 * after CourtSide has said why (migrations 58 and 107). Every workout type
 * comes with the one Workout permission, its distance included.
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
 * Any workout from Health (owner, Oct 5): what it was as a short name
 * ('tennis', 'run', 'strength'…; features/activity/workouts.ts), and its
 * distance in metres when Health has one (runs, walks, rides, swims).
 */
export type HealthWorkout = TennisWorkout & { sport: string; distanceM?: number };

/** Miles as the library hands them over → whole metres, or nothing for a workout with no distance. */
const metresOf = (miles: number | undefined) => (typeof miles === 'number' && Number.isFinite(miles) && miles > 0 ? Math.round(miles * 1609.344) : undefined);

/**
 * Workouts saved to Health since a moment, newest first, at most `limit`.
 * `sports` keeps only those kinds ('tennis', or 'other' for everything else).
 * `skipWhoopTennis` leaves out the tennis the WHOOP app copied into Health,
 * when WHOOP already sends its own straight to the server; `skipWhoopOther`
 * its runs and lifts the same way, once WHOOP sends every workout too
 * (migration 135); until then they are kept. `heartRate:
 * false` skips the heart-rate read (one ask of Health per workout, the slow
 * part), for a plain list. `skip` leaves out workouts by Health's id (ones
 * already handed to the server), before their heart rate is read and before
 * `limit` counts them. Never throws.
 */
export async function readWorkouts(sinceIso: string, opts: { sports?: ('tennis' | 'other')[]; skipWhoopTennis?: boolean; skipWhoopOther?: boolean; limit?: number; heartRate?: boolean; untilIso?: string; skip?: (id: string) => boolean } = {}): Promise<HealthWorkout[]> {
  const h = load();
  if (!h) return [];
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  const sports = opts.sports ?? ['tennis', 'other'];
  try {
    // getSamples, not getAnchoredWorkouts: the anchored query drops any workout saved without metadata.
    const all = await settle(call<AppleWorkout[]>((cb) => h.getSamples({ type: 'Workout', startDate: sinceIso, endDate: opts.untilIso ?? new Date().toISOString(), ascending: false }, cb)));
    const picked = (all ?? [])
      .map((w) => ({ w, sport: slugOfAppleWorkout(w.activityId, w.activityName) }))
      .filter(({ sport }) => sports.includes(sport === 'tennis' ? 'tennis' : 'other'))
      .filter(({ w, sport }) => !((sport === 'tennis' ? opts.skipWhoopTennis : opts.skipWhoopOther) && /whoop/i.test(`${w.sourceName} ${w.sourceId}`)))
      .filter(({ w }) => !opts.skip?.(w.id))
      .slice(0, opts.limit ?? 40);
    const out: HealthWorkout[] = [];
    for (const { w, sport } of picked) {
      // A workout with an unreadable time is skipped on its own, not with the rest.
      let startedAt: string;
      let endedAt: string;
      try { startedAt = isoOf(w.start); endedAt = isoOf(w.end); } catch { continue; }
      let maxHr: number | undefined;
      let avgHr: number | undefined;
      if (opts.heartRate !== false) {
        const hr = await settle(call<HrSample[]>((cb) => h.getHeartRateSamples({ startDate: w.start, endDate: w.end, ascending: true }, cb)));
        // The workout's own watch first; any other source's beats only when it saved none.
        const own = (hr ?? []).filter((s) => s.sourceId === w.sourceId);
        const vals = (own.length ? own : hr ?? []).map((s) => s.value).filter((v) => v >= 30 && v <= 250);
        maxHr = vals.length ? Math.round(Math.max(...vals)) : undefined;
        avgHr = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
      }
      out.push({
        id: w.id,
        sport,
        startedAt,
        endedAt,
        minutes: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
        kcal: w.calories > 0 ? Math.round(w.calories) : undefined,
        // Tennis has no distance worth showing (a Watch counts the steps around the court).
        distanceM: sport === 'tennis' ? undefined : metresOf(w.distance),
        maxHr,
        avgHr,
        device: w.device || w.sourceName || undefined,
        tzOffsetMin: -new Date(startedAt).getTimezoneOffset(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Tennis workouts saved to Health since a moment, newest first, at most 10.
 * `skipWhoop` leaves out the ones the WHOOP app copied into Health, when
 * WHOOP already sends its own straight to the server. Never throws.
 */
export async function readTennisWorkouts(sinceIso: string, opts: { skipWhoop?: boolean } = {}): Promise<TennisWorkout[]> {
  return (await readWorkouts(sinceIso, { sports: ['tennis'], skipWhoopTennis: opts.skipWhoop, limit: 10 }))
    .map(({ sport: _sport, distanceM: _distance, ...w }) => w);
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

/** The same day for the Health page's Food card, with the app it came from when one stands out. */
export type FoodDayFrom = FoodDay & { source?: string };

/** The four food numbers Health holds that Cronometer and MyFitnessPal both write. */
const FOOD_KEYS = ['calories', 'proteinGrams', 'carbGrams', 'fatGrams'] as const;
type FoodKey = (typeof FOOD_KEYS)[number];

/** Midnight on this phone `back` days ago, so the first day read is a whole day, never half of one. */
const midnightDaysAgo = (back: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - back); return d; };

/** Asks for the food numbers alone, for the Food card. Throws when refused or when HealthKit is not in this build. */
export async function connectAppleFood(): Promise<void> {
  const h = load();
  if (!h) throw new Error('Apple Health is not available in this version of CourtSide.');
  const P = h.Constants.Permissions;
  const read = [P.EnergyConsumed, P.Protein, P.Carbohydrates, P.FatTotal].filter(Boolean);
  await new Promise<void>((res, rej) => h.initHealthKit({ permissions: { read, write: [] } }, (err) => (err ? rej(new Error(err)) : res())));
}

/**
 * What MyFitnessPal or Cronometer logged, read from Health: both apps write
 * each meal's calories, protein, carbs and fat there once their own "share
 * with Apple Health" switch is on. Summed per day, newest first.
 *
 * Someone with both apps sharing would otherwise be counted twice, so each
 * day's numbers all come from the one app that logged the most calories that day.
 */
export async function readAppleNutritionFrom(days = 14): Promise<FoodDayFrom[]> {
  const h = load();
  if (!h) return [];
  const range = { startDate: midnightDaysAgo(days - 1).toISOString(), endDate: new Date().toISOString() };
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  // day -> number -> app -> total
  const sums = new Map<string, Map<FoodKey, Map<string, number>>>();
  const add = (rows: SourcedSample[] | null, key: FoodKey) => {
    for (const r of rows ?? []) {
      if (!(r.value > 0)) continue;
      const day = sums.get(dayOf(r.startDate)) ?? new Map<FoodKey, Map<string, number>>();
      const bySource = day.get(key) ?? new Map<string, number>();
      const from = r.sourceName || r.sourceId || 'Health';
      bySource.set(from, (bySource.get(from) ?? 0) + r.value);
      day.set(key, bySource);
      sums.set(dayOf(r.startDate), day);
    }
  };
  add(await settle(call<SourcedSample[]>((cb) => h.getEnergyConsumedSamples(range, cb))), 'calories');
  add(await settle(call<SourcedSample[]>((cb) => h.getProteinSamples(range, cb))), 'proteinGrams');
  add(await settle(call<SourcedSample[]>((cb) => h.getCarbohydratesSamples(range, cb))), 'carbGrams');
  add(await settle(call<SourcedSample[]>((cb) => h.getTotalFatSamples(range, cb))), 'fatGrams');
  const out: FoodDayFrom[] = [];
  for (const [date, byKey] of sums) {
    // One app per day (the one that logged the most calories), and all four
    // numbers from it, so a day never mixes one app's calories with another's protein.
    const d: FoodDayFrom = { date };
    const top = [...(byKey.get('calories') ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    d.source = top[0];
    for (const key of FOOD_KEYS) {
      const v = byKey.get(key)?.get(top[0]);
      if (v !== undefined) d[key] = Math.round(v);
    }
    out.push(d);
  }
  return out.filter((d) => (d.calories ?? 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** The same days without where they came from, as the server keeps them. */
export async function readAppleNutrition(days = 14): Promise<FoodDay[]> {
  return (await readAppleNutritionFrom(days)).map(({ source: _source, ...day }) => day);
}
