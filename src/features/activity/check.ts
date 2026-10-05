import AsyncStorage from '@react-native-async-storage/async-storage';

import { remote } from '@/data/remote';
import type { ID, TrackerId } from '@/data/types';
import { appleHealthAvailable, readWorkouts } from '@/features/health/appleHealth';

/*
 * The check for new tennis sessions and (since Oct 5) other workouts, run
 * when the app opens, every couple of minutes while it is open, and when it
 * comes back to the front. Apple Health can only be read on the phone, so
 * the phone reads it and hands each workout to the server; WHOOP lives on
 * WHOOP's servers, so the phone asks ours to look (at most hourly — WHOOP's
 * own alert usually arrives first). Fitbit, Oura and Polar (migration 69)
 * are asked of the server the same way, at most hourly each. The server
 * decides, once and under a lock, whether a session is new, so two checks at
 * once never announce it twice.
 *
 * The past week, once (owner, Oct 5): the first look with every workout
 * switched on (flag:workouts-apple, migration 107) goes back a week, under a
 * key of its own, so phones that already looked for tennis look back a week
 * too, and each of the past week's workouts gets its row in Notifications.
 * Until the server has that switch (before migration 107) this phone keeps
 * to tennis and its old key, so the week is never used up early. WHOOP and
 * the trackers are asked for a week once each the same way.
 *
 * No .web twin: Apple Health is never available in a browser, and the WHOOP
 * call works there as it does on a phone.
 */

const APPLE_EVERY = 2 * 60_000;
const WHOOP_EVERY = 60 * 60_000;
const WEEK = 7 * 86_400_000;
/** A watch can take hours to hand a workout to the phone: each look goes this far behind the last. */
const LAG = 6 * 3_600_000;

let running: Promise<ID[]> | null = null;

/** When this phone last looked, kept per account. Null when it never has (or storage is unavailable). */
async function lastLook(key: string): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
async function noteLook(key: string, at: number) {
  try { await AsyncStorage.setItem(key, String(at)); } catch { /* the next check simply looks again */ }
}

/** What to look at: Apple Health's tennis (`apple`) and its other workouts (`appleWorkouts`), WHOOP's tennis, and the trackers'. */
export type CheckSources = { apple: boolean; appleWorkouts?: boolean; whoop: boolean; trackers?: TrackerId[] };

/** New tennis sessions and workouts: Apple Health read on this phone, WHOOP and the other trackers asked of the server. Returns the ids just filed. Never throws. */
export function checkForTennis(me: ID, src: CheckSources, force = false): Promise<ID[]> {
  running ??= (async () => {
    const filed: ID[] = [];
    const now = Date.now();

    if ((src.apple || src.appleWorkouts) && appleHealthAvailable()) {
      // Every workout: a key of its own, whose first look is the past week (see above).
      const key = src.appleWorkouts ? `courtside-workouts-apple:${me}` : `courtside-tennis-apple:${me}`;
      const last = await lastLook(key);
      if (force || last === null || now - last > APPLE_EVERY) {
        // Six hours further back than the last look; the first look goes back a week.
        const since = new Date((last ?? now - WEEK) - LAG).toISOString();
        const sports: ('tennis' | 'other')[] = [...(src.apple ? ['tennis' as const] : []), ...(src.appleWorkouts ? ['other' as const] : [])];
        let failed = false;
        // At most 40 a look (the newest), well inside the server's 60 a day.
        for (const w of await readWorkouts(since, { sports, skipWhoopTennis: src.whoop, limit: 40 })) {
          const r = await remote.reportActivity(w.id, {
            sport: w.sport, started_at: w.startedAt, ended_at: w.endedAt, tz_offset_min: w.tzOffsetMin,
            avg_hr: w.avgHr ?? null, max_hr: w.maxHr ?? null, kcal: w.kcal ?? null, device: w.device ?? null,
            ...(w.distanceM ? { distance_m: w.distanceM } : {}),
          });
          if (r === 'error') failed = true;
          else if (r?.notify) filed.push(r.id);
        }
        // A workout that did not get through is read again next time.
        if (!failed) await noteLook(key, now);
      }
    }

    if (src.whoop) {
      const key = `courtside-tennis-whoop:${me}`;
      // The past week of WHOOP's tennis, asked for once. Done only when WHOOP's
      // function says it looked that far: one from before Oct 5 looks 36 hours
      // and does not say, so it is asked again at the next hourly look.
      const weekKey = `courtside-whoop-week:${me}`;
      const week = (await lastLook(weekKey)) === null;
      const last = await lastLook(key);
      if (force || last === null || now - last > WHOOP_EVERY) {
        // A server without the tennis part yet answers with an error, which is simply ignored.
        const r = await remote.whoop<{ fresh?: ID[]; workoutDays?: number }>('sync', { only: 'workouts', ...(week ? { days: 7 } : {}) }).catch(() => null);
        filed.push(...(r?.fresh ?? []));
        await noteLook(key, now);
        if (week && (r?.workoutDays ?? 0) >= 7) await noteLook(weekKey, now);
      }
    }

    for (const provider of src.trackers ?? []) {
      const key = `courtside-tennis-${provider}:${me}`;
      const weekKey = `courtside-${provider}-week:${me}`;
      const week = (await lastLook(weekKey)) === null;
      const last = await lastLook(key);
      if (force || last === null || now - last > WHOOP_EVERY) {
        // A server without the trackers function answers with an error, which is simply ignored.
        const r = await remote.trackers<{ fresh?: ID[]; days?: number }>('sync', { provider, ...(week ? { days: 7 } : {}) }).catch(() => null);
        filed.push(...(r?.fresh ?? []));
        await noteLook(key, now);
        // The trackers function has taken `days` since it was written (migration 69): any answer means it looked.
        if (week && r) await noteLook(weekKey, now);
      }
    }

    return filed;
  })().catch(() => [] as ID[]).finally(() => { running = null; });
  return running;
}
