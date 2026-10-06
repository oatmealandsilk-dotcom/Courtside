import type { DetectedActivity, ID } from '@/data/types';
import { readWorkouts, type HealthWorkout } from '@/features/health/appleHealth';
import type { TennisFlags } from './flags';
import { sourceOn } from './recent';
import { isTennisActivity } from './workouts';

/*
 * Past workouts (owner, Oct 5: "maybe even see his old ones"): the last 30
 * days of workouts, newest first, from two places put together. The
 * server's rows (what it already keeps: every tracker, any phone) and, on an
 * iPhone, the Health app itself, for anything the server has not been handed
 * yet (older than the week the app looks back, say). The same workout in
 * both is listed once, by Health's own id. Each says whether it is logged,
 * hidden, or waiting, with Log it.
 */

/** How far back: the 30 days the server keeps a workout for (migration 58). */
export const PAST_DAYS = 30;

export type PastWorkout = {
  /** The server's row id, or Health's own id for one not handed over yet. */
  key: string;
  sport: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  distanceM?: number;
  kcal?: number;
  source: DetectedActivity['source'];
  device?: string;
  tzOffsetMin?: number;
  /** The server's row, once it has one. */
  row?: DetectedActivity;
  /** Read from this phone's Health, not handed to the server yet: Log it hands it over first. */
  health?: HealthWorkout;
  /** Waiting to be logged, in your log already, or hidden ("Not tennis? Hide it"). */
  status: 'new' | 'logged' | 'hidden';
};

/** What a server row stands as: a copy of another session goes with that one; one logged by hand counts as logged. */
function standing(a: DetectedActivity, rows: DetectedActivity[]): PastWorkout['status'] | null {
  if (a.status === 'withdrawn') return null;
  if (a.status === 'logged') return 'logged';
  if (a.status === 'dismissed') return 'hidden';
  if (a.status === 'duplicate') {
    const twin = a.duplicateOf ? rows.find((x) => x.id === a.duplicateOf) : undefined;
    // Listed once: the twin stands for it.
    if (twin) return null;
    // A copy with no twin to point at was logged by hand (migration 58's "logged-by-hand").
    return a.duplicateOf ? 'new' : 'logged';
  }
  return 'new';
}

/**
 * The list, newest first. `rows` are the server's (any source switched on),
 * `health` this phone's Health workouts of the kinds switched on.
 */
export function mergePast(rows: DetectedActivity[], health: HealthWorkout[], flags: TennisFlags, me: ID, now = Date.now()): PastWorkout[] {
  const since = now - PAST_DAYS * 86_400_000;
  const out: PastWorkout[] = [];
  const seen = new Set<string>();
  for (const a of rows) {
    if (a.userId !== me) continue;
    // Health's copy of anything the server holds is never listed again, whether or not the row itself is.
    if (a.externalId && a.source === 'apple-health') seen.add(a.externalId);
    if (!sourceOn(a, flags) || Date.parse(a.endedAt) < since) continue;
    const status = standing(a, rows);
    if (!status) continue;
    out.push({
      key: a.id, sport: a.sport, startedAt: a.startedAt, endedAt: a.endedAt, minutes: a.minutes, distanceM: a.distanceM, kcal: a.kcal,
      source: a.source, device: a.device, tzOffsetMin: a.tzOffsetMin, row: a, status,
    });
  }
  for (const w of health) {
    if (seen.has(w.id) || Date.parse(w.startedAt) < since) continue;
    // The server takes 5 minutes to 10 hours (migration 58): anything else could never be logged.
    if (w.minutes < 5 || w.minutes > 600) continue;
    const tennis = w.sport === 'tennis';
    if (tennis ? !flags.apple : !flags.workoutsApple) continue;
    out.push({
      key: `hk:${w.id}`, sport: w.sport, startedAt: w.startedAt, endedAt: w.endedAt, minutes: w.minutes, distanceM: w.distanceM, kcal: w.kcal,
      source: 'apple-health', device: w.device, tzOffsetMin: w.tzOffsetMin, health: w, status: 'new',
    });
  }
  return out.sort((x, y) => y.startedAt.localeCompare(x.startedAt));
}

/**
 * This phone's Health workouts of the last 30 days, of the kinds switched on, without heart rate (one ask of Health for the whole list).
 * Those the WHOOP app copied into Health are left out when WHOOP sends its own: its tennis (`whoopTennis`), its other workouts (`whoopAll`).
 */
export function readPastHealth(flags: TennisFlags, whoopTennis: boolean, whoopAll = false): Promise<HealthWorkout[]> {
  const sports: ('tennis' | 'other')[] = [...(flags.apple ? ['tennis' as const] : []), ...(flags.workoutsApple ? ['other' as const] : [])];
  if (!sports.length) return Promise.resolve([]);
  // Ten minutes inside the 30 days, so the server never turns the oldest away.
  const since = new Date(Date.now() - PAST_DAYS * 86_400_000 + 10 * 60_000).toISOString();
  return readWorkouts(since, { sports, skipWhoopTennis: whoopTennis, skipWhoopOther: whoopAll, limit: 200, heartRate: false });
}

/** One Health workout read again, with its heart rate this time, to hand to the server. Null when Health no longer has it. */
export async function readOneWithHeartRate(w: HealthWorkout): Promise<HealthWorkout | null> {
  const from = new Date(Date.parse(w.startedAt) - 60_000).toISOString();
  const to = new Date(Date.parse(w.endedAt) + 60_000).toISOString();
  const found = await readWorkouts(from, { untilIso: to, limit: 20 });
  return found.find((x) => x.id === w.id) ?? null;
}

/** Whether a past workout is a tennis session (it then logs as tennis does: practice, match, drills). */
export const pastIsTennis = (w: Pick<PastWorkout, 'sport'>) => isTennisActivity(w);
