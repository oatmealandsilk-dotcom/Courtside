import { Platform } from 'react-native';

import { remote } from '@/data/remote';
import { localDay } from '@/features/practice/stats';

/**
 * Days already noted in this run of the app, by account and date, so a
 * phone woken twenty times a day still asks the server once. Kept only in
 * memory: after a restart it asks once more, which changes nothing there
 * (only the first open of a day is kept).
 */
const noted = new Set<string>();

/**
 * "Opened the app today" (migration 110), for the owner's daily active users
 * and day-1 / day-7 return numbers. Called when the app has loaded an
 * account and whenever it comes back to the front.
 *
 * Never waited on and never shown: it cannot slow down or break anything on
 * screen. Offline or a hiccup: it tries again the next time the app comes
 * to the front. A database without migration 110 yet: it stops asking until
 * tomorrow (or the next restart).
 */
export function noteAppOpen(userId: string): void {
  const day = localDay(Date.now());
  const key = `${userId}|${day}`;
  if (noted.has(key)) return;
  noted.add(key);
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other';
  void remote.noteAppOpen(platform, day).then((result) => {
    if (result === 'failed') noted.delete(key);
  });
}
