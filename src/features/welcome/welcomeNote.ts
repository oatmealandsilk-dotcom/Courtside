import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import type { User } from '@/data/types';

/*
 * A welcome from CourtSide itself, in a new player's notifications (Oct 5,
 * owner: "Do all"). Until now nobody welcomed a new player unless they
 * posted (Admin → Welcome lists first posts), so the 72% who never post
 * found an empty bell. It is CourtSide's own row, not a person messaging
 * them, so it is the same for a teen. It lives on this phone only: no
 * database row, nothing sent anywhere.
 *
 * The bell counts it as new for the first two days after joining, until
 * Notifications has been opened once; the row itself stays at the top for
 * two weeks.
 */
const NEW_DAYS = 2;
const KEEP_DAYS = 14;
const key = (userId: string) => `courtside.welcome.seen:${userId}`;

/** Per account: true seen, false not yet, missing still being read. */
const seen = new Map<string, boolean>();
const reading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function read(userId: string) {
  if (seen.has(userId) || reading.has(userId)) return;
  reading.add(userId);
  void AsyncStorage.getItem(key(userId))
    // Storage that will not answer counts as seen, so the badge never sticks. Never
    // turned back to unseen: Notifications may have marked it seen while this read was
    // on its way (opened straight from a push or a link, before the read came back).
    .then((raw) => { seen.set(userId, seen.get(userId) === true || raw !== null); }, () => { seen.set(userId, true); })
    .finally(() => { reading.delete(userId); emit(); });
}

const daysSince = (iso: string | undefined) => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? (Date.now() - at) / 86_400_000 : Infinity;
};

export interface WelcomeNote {
  /** The row is in the list. */
  shown: boolean;
  /** The bell counts it. */
  unread: boolean;
  markSeen: () => void;
}

export function useWelcomeNote(me: Pick<User, 'id' | 'joinedAt'> | null | undefined): WelcomeNote {
  const id = me?.id ?? null;
  useEffect(() => { if (id) read(id); }, [id]);
  const state = useSyncExternalStore(subscribe, () => (id ? seen.get(id) : undefined), () => undefined);
  const age = daysSince(me?.joinedAt);
  const fresh = age < NEW_DAYS;
  const unread = !!id && fresh && state === false;
  return {
    shown: !!id && age < KEEP_DAYS && (fresh || state === true),
    unread,
    markSeen: () => {
      if (!id || seen.get(id) === true) return;
      seen.set(id, true);
      void AsyncStorage.setItem(key(id), new Date().toISOString()).catch(() => undefined);
      emit();
    },
  };
}
