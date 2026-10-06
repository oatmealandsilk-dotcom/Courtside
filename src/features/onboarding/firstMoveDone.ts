import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/*
 * Whether this account has made its first move on the page after setup
 * (shared its link, followed someone, went to find a friend, posted), kept
 * on this phone (Oct 5). Profile's "Make your first move" card otherwise
 * only knew about posts, questions and answers, so a player who had just
 * shared their link or followed three people kept being asked to do it.
 * "Later" is not a move, so it never counts.
 */
const key = (userId: string) => `courtside.firstMove.done:${userId}`;

/** Per account: true done, false not yet, missing still being read. */
const done = new Map<string, boolean>();
const reading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function read(userId: string) {
  if (done.has(userId) || reading.has(userId)) return;
  reading.add(userId);
  void AsyncStorage.getItem(key(userId))
    // Never undoes a move noted while the read was on its way.
    .then((raw) => { done.set(userId, done.get(userId) === true || raw !== null); }, () => { if (!done.has(userId)) done.set(userId, false); })
    .finally(() => { reading.delete(userId); emit(); });
}

/** The first-move page's move, other than Later. */
export function markFirstMoveDone(userId: string): void {
  if (done.get(userId) === true) return;
  done.set(userId, true);
  void AsyncStorage.setItem(key(userId), new Date().toISOString()).catch(() => undefined);
  emit();
}

export function useFirstMoveDone(userId: string | null | undefined): boolean {
  useEffect(() => { if (userId) read(userId); }, [userId]);
  return useSyncExternalStore(subscribe, () => (userId ? done.get(userId) === true : false), () => false);
}
