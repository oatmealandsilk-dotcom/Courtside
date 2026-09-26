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
type HK = {
  initHealthKit: (perms: { permissions: { read: string[]; write: string[] } }, cb: (err: string | null) => void) => void;
  getDailyStepCountSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getActiveEnergyBurned: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getHeartRateVariabilitySamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getRestingHeartRateSamples: (o: object, cb: (err: string | null, r: Sample[]) => void) => void;
  getSleepSamples: (o: object, cb: (err: string | null, r: (Sample & { value: unknown })[]) => void) => void;
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

/** Asks once for read access. Throws when refused or when HealthKit is not in this build. */
export async function connectAppleHealth(): Promise<void> {
  const h = load();
  if (!h) throw new Error('Apple Health is not available in this version of CourtSide.');
  const P = h.Constants.Permissions;
  await new Promise<void>((res, rej) => h.initHealthKit({ permissions: { read: [P.Steps, P.StepCount, P.ActiveEnergyBurned, P.HeartRateVariability, P.RestingHeartRate, P.SleepAnalysis].filter(Boolean), write: [] } }, (err) => (err ? rej(new Error(err)) : res())));
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
