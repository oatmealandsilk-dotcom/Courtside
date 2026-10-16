import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { setUploadAside } from '@/lib/uploads';

/*
 * Strava's share after saving (Oct 15, owner: "Maybe there's just a place
 * to put the share button on a post screen", then "Like strava"): a post
 * with a session on it opens the Share session screen by itself the moment
 * it is posted, over the feed it landed on, its pictures ready to swipe and
 * Instagram a tap away. Done goes back to the feed. Every time, as Strava
 * does, but never as a nag: closed three times running without sharing
 * (on this phone, for this account), it stops opening by itself, and any
 * share from that screen (Stories, Copy, Save, More, Send) starts the count
 * again. A post's own share arrow always opens it.
 *
 * Which posts open it (one carrying a session; never a challenge entry or a
 * post to one group only) is the composer's to say (app/compose.tsx).
 */

/** Closed this many times running without sharing, it stops opening by itself. */
const SKIPS_TO_STOP = 3;

/** On this phone, one count per account: a shared phone keeps each player's own. */
const storeKey = (userId: string) => `courtside-share-after-post:${userId}`;

/** The counts read or written this run, so the composer has its answer the moment Share is tapped. */
const known = new Map<string, number>();

async function count(userId: string): Promise<number> {
  const had = known.get(userId);
  if (had !== undefined) return had;
  let read = 0;
  try {
    const n = Number(await AsyncStorage.getItem(storeKey(userId)));
    if (Number.isFinite(n) && n > 0) read = Math.floor(n);
  } catch { /* not readable: counted from nothing */ }
  // Written meanwhile (a share, a close): that is the newer word.
  if (!known.has(userId)) known.set(userId, read);
  return known.get(userId) ?? read;
}

function keep(userId: string, n: number) {
  known.set(userId, n);
  try { void AsyncStorage.setItem(storeKey(userId), String(n)).catch(() => undefined); } catch { /* not remembered: still counted this run */ }
}

/** Read ahead, as the composer opens, so the answer is ready when the post goes up. */
export function warmShareAfterPost(userId: string | null | undefined) {
  if (userId) void count(userId);
}

/** Whether this account's next session post opens the Share session screen by itself. Not read yet: yes, as for anyone new. */
export function opensAfterPost(userId: string): boolean {
  return (known.get(userId) ?? 0) < SKIPS_TO_STOP;
}

/** Closed straight after posting without sharing anything: one more toward stopping. */
export function closedWithoutSharing(userId: string) {
  void count(userId).then((n) => keep(userId, n + 1));
}

/** Shared from the Share session screen, however it was opened: the count starts again. */
export function sharedFromScreen(userId: string) {
  if (known.get(userId) !== 0) keep(userId, 0);
}

/**
 * Opens it over the page the post landed on (the composer has just closed
 * down to it): ?posted=1 makes it "Share your session", with Done. A post
 * still going up says how it is going there, not on the strip across the
 * top, which would sit over the screen's title and Done.
 */
export function openShareAfterPost(postId: string) {
  setUploadAside(postId, true);
  router.push({ pathname: '/share-session', params: { post: postId, posted: '1' } });
}
