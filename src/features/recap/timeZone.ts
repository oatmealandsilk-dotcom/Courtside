import AsyncStorage from '@react-native-async-storage/async-storage';

import { remote } from '@/data/remote';
import { localDay } from '@/features/practice/stats';

/**
 * This phone's time zone name ("America/Los_Angeles"), or null when it
 * cannot say. The weekly recap goes out at 8am in it (migration 130).
 */
export function phoneTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 && tz.length <= 64 ? tz : null;
  } catch {
    return null;
  }
}

const keyOf = (userId: string) => `courtside-tz:${userId}`;
/** Checked already in this run of the app, by account and day. */
const checked = new Set<string>();
/** Tries today that the server didn't keep, by account and day: a new account's settings row may only come with onboarding. */
const missed = new Map<string, number>();

/**
 * Once a day, as the app opens (and comes back to the front): tells the
 * server this phone's time zone when it is not the one it last told it (a
 * trip, a new phone), so the Monday recap lands at 8am where you are. The
 * last one told is kept on this phone. Never waited on, never shown; a
 * database without migration 130 answers nothing, and it tries again the
 * next day.
 */
export function noteTimeZone(userId: string): void {
  const day = localDay(Date.now());
  const once = `${userId}|${day}`;
  if (checked.has(once)) return;
  checked.add(once);
  const tz = phoneTimeZone();
  if (!tz) return;
  void (async () => {
    let told: string | null = null;
    try { told = await AsyncStorage.getItem(keyOf(userId)); } catch { /* asked again below */ }
    if (told === tz) return;
    const ok = await remote.setMyTimeZone(tz).catch(() => null);
    // Not kept (no settings row yet: a new account before onboarding saves them; or a name the server
    // does not know): tried again the next times the app comes to the front, up to 3 more today.
    // Not said at all (offline, an older database): tried again tomorrow.
    if (ok) await AsyncStorage.setItem(keyOf(userId), tz).catch(() => undefined);
    else if (ok === false && (missed.get(once) ?? 0) < 3) { missed.set(once, (missed.get(once) ?? 0) + 1); checked.delete(once); }
  })();
}
