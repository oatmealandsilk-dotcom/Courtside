import { endOfToday, todayAt } from '@/features/players/openToHit';

/**
 * The demo's "open till" times, worked out when the demo loads: till this
 * hour today ("till 8pm" on their ring), or till midnight once that hour is
 * less than an hour away, so the Open to hit row always has faces in it.
 */
export const demoTill = (hour: number): string => {
  const at = todayAt(hour);
  return at.getTime() - Date.now() > 3_600_000 ? at.toISOString() : endOfToday();
};

/** Noor till 8pm, Lena till 6pm, Diego till 7pm; Sam and Bea till midnight (users.ts and presence.ts say the same). */
export const NOOR_TILL = demoTill(20);
export const LENA_TILL = demoTill(18);
export const DIEGO_TILL = demoTill(19);
