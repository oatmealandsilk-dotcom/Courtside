import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether "Your week" (last week's recap on Your sessions, Monday to
 * Wednesday) has been put away for a week, kept on this phone per account and
 * week. Remembered in memory once read, and read ahead by the Tennis profile
 * (warmRecapAway), so Your sessions knows it on its first frame and its
 * summary no longer drops in and pushes the lists down (Oct 22 sweep).
 */
const key = (me: string, week: string) => `courtside-recap-away:${me}:${week}`;
const known = new Map<string, boolean>();

/** What is known already, or null until it has been read. */
export function recapAwayKnown(me: string, week: string): boolean | null {
  return known.get(key(me, week)) ?? null;
}

/** Reads it (once) and remembers the answer. */
export async function readRecapAway(me: string, week: string): Promise<boolean> {
  const k = key(me, week);
  const was = known.get(k);
  if (was !== undefined) return was;
  try {
    const v = await AsyncStorage.getItem(k);
    if (!known.has(k)) known.set(k, !!v);
  } catch {
    if (!known.has(k)) known.set(k, false);
  }
  return known.get(k)!;
}

/** Read ahead, from the page that leads to Your sessions. */
export function warmRecapAway(me: string | null | undefined, week: string) {
  if (me) void readRecapAway(me, week);
}

/** Put away for that week. */
export function putRecapAway(me: string, week: string) {
  known.set(key(me, week), true);
  void AsyncStorage.setItem(key(me, week), '1').catch(() => undefined);
}
