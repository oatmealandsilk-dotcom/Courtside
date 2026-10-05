import { useEffect, useState } from 'react';

/** The longest single wait: a timer re-arms after it, so a far-off time is never missed (or fired early by an overflowing timer). */
const MAX_WAIT_MS = 6 * 3_600_000;
/** A beat past the moment itself, so the time has surely passed when the screen looks again. */
const PAST_MS = 500;

/** The soonest of these moments still ahead of `now`, or null when none is. */
export function nextEnd(times: readonly (string | null | undefined)[], now = Date.now()): number | null {
  let soonest: number | null = null;
  for (const iso of times) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > now && (soonest === null || t < soonest)) soonest = t;
  }
  return soonest;
}

/**
 * Now, as a number that moves on by itself the moment the soonest of these
 * "open until" times passes, and at midnight (when "till 3pm tomorrow"
 * becomes "till 3pm"). With picked times a ring ends many times a day, not
 * only at midnight: a screen that shows rings and "till" times reads this,
 * so a ring that has ended goes out on its own, without waiting for
 * something else to change.
 */
export function useOpenClock(times: readonly (string | null | undefined)[]): number {
  const [now, setNow] = useState(() => Date.now());
  const key = times.join('|');
  useEffect(() => {
    const t0 = Date.now();
    const midnight = new Date(t0);
    midnight.setHours(24, 0, 0, 0);
    const at = Math.min(nextEnd(times, t0) ?? Infinity, midnight.getTime());
    const id = setTimeout(() => setNow(Date.now()), Math.min(Math.max(at - t0, 0) + PAST_MS, MAX_WAIT_MS));
    return () => clearTimeout(id);
  }, [key, now]); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}
