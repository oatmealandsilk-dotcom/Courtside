import AsyncStorage from '@react-native-async-storage/async-storage';

import { remote } from '@/data/remote';
import type { ID, TrackerId } from '@/data/types';
import { appleHealthAvailable, readWorkouts, type HealthWorkout } from '@/features/health/appleHealth';

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
 * switched on (the person's own yes to it, migration 107) goes back a week,
 * under a key of its own, so phones that already looked for tennis look
 * back a week too, and each of the past week's workouts gets its row in
 * Notifications. Tennis alone (Apple Health, WHOOP and the trackers) is
 * looked back over for a week once too. All of it waits for
 * 'flag:workouts-apple' to be on for this person (`weekBack`): that switch
 * only exists once the server keeps a week-old session as news (migration
 * 107; before, 48 hours, and a week looked at then would be used up for
 * nothing), and it is tried on the owner's iPhone before everyone has it.
 *
 * Each workout is handed to the server once per app session: the looks
 * every couple of minutes skip any already handed over (and their
 * heart-rate read), so an open app does not send the same ones again.
 *
 * From App Store build 15 an iPhone also puts up its own lock-screen alert
 * the moment Health saves a workout, app closed or not (features/health/
 * workoutWatch). A tap on it hands that one workout over here
 * (reportFromAlert), and with the app open the module asks for a look at
 * once instead of an alert (useWorkoutWatch).
 *
 * No .web twin: Apple Health is never available in a browser, and the WHOOP
 * call works there as it does on a phone.
 */

const APPLE_EVERY = 2 * 60_000;
const WHOOP_EVERY = 60 * 60_000;
const WEEK = 7 * 86_400_000;
/** A watch can take hours to hand a workout to the phone: each look goes this far behind the last. */
const LAG = 6 * 3_600_000;

/** What a look found: the ids just filed (each with its row in Notifications), and whether anything new reached the server at all. */
export type CheckResult = { filed: ID[]; news: boolean };

let running: Promise<CheckResult> | null = null;

/** Apple Health workouts already handed to the server in this app session ('<account>:<Health id>' → when it ended). */
const handed = new Map<string, number>();
/** Lets go of the ones no look reaches any more (a look goes back at most a week and six hours). */
function forgetOld(now: number) {
  for (const [k, ended] of handed) if (ended < now - WEEK - LAG - 86_400_000) handed.delete(k);
}

/**
 * Workouts (by Health's id) whose lock-screen alert was just tapped: the tap
 * opens Log it on the workout itself, so a look that finds it in the same
 * moment (the app coming to the front) files it without its in-app note on
 * top of that page.
 */
const openedFromAlert = new Set<string>();
export function openingFromAlert(healthId: string) { openedFromAlert.add(healthId); }

/** What the server is handed for one Apple Health workout (report_activity). */
const reportOf = (w: HealthWorkout) => ({
  sport: w.sport, started_at: w.startedAt, ended_at: w.endedAt, tz_offset_min: w.tzOffsetMin,
  avg_hr: w.avgHr ?? null, max_hr: w.maxHr ?? null, kcal: w.kcal ?? null, device: w.device ?? null,
  ...(w.distanceM ? { distance_m: w.distanceM } : {}),
});

/**
 * One workout from the phone's own "Workout detected" alert (workoutWatch),
 * tapped: read from Health by its id, with its heart rate, and handed to the
 * server just as a look hands one over, so it gets its row in Notifications
 * too and a look does not hand it over again. Its id on the server, to open
 * Log it on; null when Health no longer has it or the server turned it
 * away; 'error' when it did not get through. Never throws.
 */
export async function reportFromAlert(me: ID, w: { id: string; startedAt: string; endedAt: string }): Promise<ID | null | 'error'> {
  openingFromAlert(w.id);
  try {
    const from = new Date(Date.parse(w.startedAt) - 60_000).toISOString();
    const to = new Date(Date.parse(w.endedAt) + 60_000).toISOString();
    const [found] = await readWorkouts(from, { untilIso: to, limit: 1, skip: (id) => id !== w.id });
    if (!found) return null;
    const r = await remote.reportActivity(found.id, reportOf(found));
    if (r === 'error') return 'error';
    handed.set(`${me}:${found.id}`, Date.parse(found.endedAt));
    return r?.id ?? null;
  } catch {
    return 'error';
  }
}

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

/**
 * What to look at: Apple Health's tennis (`apple`) and its other workouts
 * (`appleWorkouts`), WHOOP's tennis, and the trackers'. `weekBack`: the
 * one-time look back over the past week may be used ('flag:workouts-apple'
 * is on for this person, so the server keeps a week-old session as news).
 */
export type CheckSources = { apple: boolean; appleWorkouts?: boolean; whoop: boolean; trackers?: TrackerId[]; weekBack?: boolean };

/** New tennis sessions and workouts: Apple Health read on this phone, WHOOP and the other trackers asked of the server. Never throws. */
export function checkForTennis(me: ID, src: CheckSources, force = false): Promise<CheckResult> {
  running ??= (async () => {
    const filed: ID[] = [];
    /** Each Apple Health workout filed in this look: the server's id → Health's. */
    const fromHealth = new Map<ID, string>();
    let news = false;
    const now = Date.now();
    forgetOld(now);

    if ((src.apple || src.appleWorkouts) && appleHealthAvailable()) {
      // Every workout: a key of its own, whose first look is the past week (see above).
      const key = src.appleWorkouts ? `courtside-workouts-apple:${me}` : `courtside-tennis-apple:${me}`;
      // Tennis alone, already looked for before: its past week once more, with `weekBack` (see above).
      const weekKey = `courtside-apple-week:${me}`;
      const week = !!src.weekBack && (await lastLook(weekKey)) === null;
      const last = await lastLook(key);
      if (force || week || last === null || now - last > APPLE_EVERY) {
        // Six hours further back than the last look; the first look (and the week's) goes back a week.
        const since = new Date((week || last === null ? now - WEEK : last) - LAG).toISOString();
        const sports: ('tennis' | 'other')[] = [...(src.apple ? ['tennis' as const] : []), ...(src.appleWorkouts ? ['other' as const] : [])];
        let failed = false;
        // At most 40 a look (the newest not handed over yet), well inside the server's 60 a day.
        const fresh = await readWorkouts(since, { sports, skipWhoopTennis: src.whoop, limit: 40, skip: (id) => handed.has(`${me}:${id}`) });
        for (const w of fresh) {
          const r = await remote.reportActivity(w.id, reportOf(w));
          if (r === 'error') { failed = true; continue; }
          // Answered (kept, or turned away as too short or too old): not handed over again this session.
          handed.set(`${me}:${w.id}`, Date.parse(w.endedAt));
          if (r) news = true;
          if (r?.notify) { filed.push(r.id); fromHealth.set(r.id, w.id); }
        }
        // A workout that did not get through is read again next time.
        if (!failed) {
          await noteLook(key, now);
          if (week) await noteLook(weekKey, now);
        }
      }
    }

    if (src.whoop) {
      const key = `courtside-tennis-whoop:${me}`;
      // The past week of WHOOP's tennis, asked for once, and only with
      // `weekBack` (see above). Done only when WHOOP's function says it
      // looked that far: one from before Oct 5 looks 36 hours and does not
      // say, so it is asked again at the next hourly look.
      const weekKey = `courtside-whoop-week:${me}`;
      const week = !!src.weekBack && (await lastLook(weekKey)) === null;
      const last = await lastLook(key);
      if (force || last === null || now - last > WHOOP_EVERY) {
        // A server without the tennis part yet answers with an error, which is simply ignored.
        const r = await remote.whoop<{ fresh?: ID[]; workoutDays?: number }>('sync', { only: 'workouts', ...(week ? { days: 7 } : {}) }).catch(() => null);
        filed.push(...(r?.fresh ?? []));
        if (r) news = true;
        await noteLook(key, now);
        if (week && (r?.workoutDays ?? 0) >= 7) await noteLook(weekKey, now);
      }
    }

    for (const provider of src.trackers ?? []) {
      const key = `courtside-tennis-${provider}:${me}`;
      const weekKey = `courtside-${provider}-week:${me}`;
      // As WHOOP's: the week only with `weekBack`.
      const week = !!src.weekBack && (await lastLook(weekKey)) === null;
      const last = await lastLook(key);
      if (force || last === null || now - last > WHOOP_EVERY) {
        // A server without the trackers function answers with an error, which is simply ignored.
        const r = await remote.trackers<{ fresh?: ID[]; days?: number }>('sync', { provider, ...(week ? { days: 7 } : {}) }).catch(() => null);
        filed.push(...(r?.fresh ?? []));
        if (r) news = true;
        await noteLook(key, now);
        // The trackers function has taken `days` since it was written (migration 69): any answer means it looked.
        if (week && r) await noteLook(weekKey, now);
      }
    }

    // One whose alert was just tapped is filed all the same, without its note (see openingFromAlert).
    return { filed: filed.filter((id) => !openedFromAlert.has(fromHealth.get(id) ?? '')), news };
  })().catch((): CheckResult => ({ filed: [], news: false })).finally(() => { running = null; });
  return running;
}
