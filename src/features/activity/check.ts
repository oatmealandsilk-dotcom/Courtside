import AsyncStorage from '@react-native-async-storage/async-storage';

import { remote } from '@/data/remote';
import type { ID } from '@/data/types';
import { appleHealthAvailable, readTennisWorkouts } from '@/features/health/appleHealth';

/*
 * The check for new tennis sessions, run when the app opens or comes back to
 * the front. Apple Health can only be read on the phone, so the phone reads
 * it and hands each tennis workout to the server; WHOOP lives on WHOOP's
 * servers, so the phone asks ours to look (at most hourly — WHOOP's own alert
 * usually arrives first). The server decides, once and under a lock, whether
 * a session is new, so two checks at once never announce it twice.
 *
 * No .web twin: Apple Health is never available in a browser, and the WHOOP
 * call works there as it does on a phone.
 */

const APPLE_EVERY = 2 * 60_000;
const WHOOP_EVERY = 60 * 60_000;

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

/** New tennis sessions: Apple Health read on this phone, WHOOP asked of the server. Returns the ids just filed. Never throws. */
export function checkForTennis(me: ID, src: { apple: boolean; whoop: boolean }, force = false): Promise<ID[]> {
  running ??= (async () => {
    const filed: ID[] = [];
    const now = Date.now();

    if (src.apple && appleHealthAvailable()) {
      const key = `courtside-tennis-apple:${me}`;
      const last = await lastLook(key);
      if (force || last === null || now - last > APPLE_EVERY) {
        // Six hours further back than the last look: a watch can take that long to hand a workout to the phone.
        const since = new Date((last ?? now - 3 * 86_400_000) - 6 * 3_600_000).toISOString();
        let failed = false;
        for (const w of await readTennisWorkouts(since, { skipWhoop: src.whoop })) {
          const r = await remote.reportActivity(w.id, {
            sport: 'tennis', started_at: w.startedAt, ended_at: w.endedAt, tz_offset_min: w.tzOffsetMin,
            avg_hr: w.avgHr ?? null, max_hr: w.maxHr ?? null, kcal: w.kcal ?? null, device: w.device ?? null,
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
      const last = await lastLook(key);
      if (force || last === null || now - last > WHOOP_EVERY) {
        // A server without the tennis part yet answers with an error, which is simply ignored.
        const r = await remote.whoop<{ fresh?: ID[] }>('sync', { only: 'workouts' }).catch(() => null);
        filed.push(...(r?.fresh ?? []));
        await noteLook(key, now);
      }
    }

    return filed;
  })().catch(() => [] as ID[]).finally(() => { running = null; });
  return running;
}
