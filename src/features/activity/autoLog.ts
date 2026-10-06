import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { appleHealthAvailable } from '@/features/health/appleHealth';
import { useApp } from '@/store/AppContext';
import { isDemo, isTracker, knownTennisFlags, tennisFlags, type TennisFlags } from './flags';

/*
 * "Log your tennis automatically" (owner, Oct 6): a friend who had worked
 * out that day joined CourtSide and got no "log activity" row. Nothing ever
 * asked him to connect Apple Health: setup asked only about him and his
 * game, and the only way in was Settings → Health and nutrition. Workouts
 * are read from Health only once it is connected, so his never were.
 *
 * Now setup offers it once, as its own card (app/(auth)/auto-log), and
 * after "Not now" it waits quietly: a slim row at the top of Activities for
 * a new player, and the Health page's own rows. Connecting turns on every
 * workout (tennis, runs, the gym…) where the server's switch for that is
 * on, and the first look goes back a week (features/activity/check.ts), so
 * a workout from today shows up at once in Notifications, ready to log.
 */

export type AutoLogSource = 'apple-health' | 'whoop';

export interface AutoLog {
  /** The server's switches and your connections are known (or this is the demo). Until then nothing is offered. */
  ready: boolean;
  /** The server's switches are known (connections may not be yet): enough to tell there is nothing to offer here. */
  known: boolean;
  /** Apple Health can be connected here: an iPhone build that carries HealthKit (or the demo), with its switch on. */
  apple: boolean;
  /** WHOOP's switch is on for this person (admins only, for now). */
  whoop: boolean;
  /** Something already brings sessions in (Apple Health, WHOOP or a tracker): nothing to offer. */
  connected: boolean;
  /** Connects a source with every workout (or tennis alone, where every workout is not switched on). Throws when it did not go through. */
  connect: (source: AutoLogSource) => Promise<void>;
}

export function useAutoLog(): AutoLog {
  const { currentUserId, integrations, healthIsReal, actions } = useApp();
  const [flags, setFlags] = useState<TennisFlags | null>(() => knownTennisFlags(currentUserId));
  useEffect(() => {
    let on = true;
    void tennisFlags(currentUserId).then((f) => { if (on) setFlags(f); });
    return () => { on = false; };
  }, [currentUserId]);
  const demo = isDemo(currentUserId);
  const apple = !!flags && (flags.apple || flags.workoutsApple) && (demo || (Platform.OS === 'ios' && appleHealthAvailable()));
  const whoop = !!flags && (flags.whoop || flags.workoutsWhoop);
  const connected = integrations.some((i) => i.connected && !!i.readsWorkouts && (i.provider === 'apple-health' || i.provider === 'whoop' || isTracker(i.provider)));
  const workoutsApple = !!flags?.workoutsApple;
  const workoutsWhoop = !!flags?.workoutsWhoop;
  const connect = useCallback(async (source: AutoLogSource) => {
    await actions.turnOnTennis(source, { workouts: source === 'apple-health' ? workoutsApple : workoutsWhoop });
  }, [actions, workoutsApple, workoutsWhoop]);
  // A real account's connections are known once its Health page data has loaded (healthIsReal); the demo's at once.
  return { ready: !!flags && (demo || !!healthIsReal), known: !!flags, apple, whoop, connected, connect };
}

/*
 * Activities' slim "Connect Apple Health to log automatically" row (owner,
 * Oct 6: a friend who joined that day followed six people, so he never saw
 * it). Now it shows whenever nothing brings sessions in, however many people
 * you follow, until its × closes it on this phone. Settings → Health and
 * nutrition still connects.
 */
const closedKey = (userId: string) => `courtside.autoLogRow.closed:${userId}`;
/** Per account: true closed, false open, missing still being read. */
const closedRows = new Map<string, boolean>();
const readingRows = new Set<string>();
const rowListeners = new Set<() => void>();
const emitRows = () => rowListeners.forEach((fn) => fn());
const subscribeRows = (fn: () => void) => { rowListeners.add(fn); return () => { rowListeners.delete(fn); }; };

function readClosed(userId: string) {
  if (closedRows.has(userId) || readingRows.has(userId)) return;
  readingRows.add(userId);
  void AsyncStorage.getItem(closedKey(userId))
    .then((raw) => { closedRows.set(userId, closedRows.get(userId) === true || raw !== null); }, () => { if (!closedRows.has(userId)) closedRows.set(userId, false); })
    .finally(() => { readingRows.delete(userId); emitRows(); });
}

export interface ConnectRow {
  auto: AutoLog;
  /** What the row connects: Apple Health where it can, else WHOOP. */
  source: AutoLogSource | null;
  /** The row shows: something to connect, nothing connected, and not closed on this phone. */
  offer: boolean;
  /** The row's ×. */
  close: () => void;
}

export function useConnectRow(): ConnectRow {
  const auto = useAutoLog();
  const { currentUserId } = useApp();
  useEffect(() => { if (currentUserId) readClosed(currentUserId); }, [currentUserId]);
  // Not offered until this phone has said whether it was closed, so it never flashes up and away.
  const closed = useSyncExternalStore(subscribeRows, () => (currentUserId ? closedRows.get(currentUserId) ?? true : true), () => true);
  const close = useCallback(() => {
    if (!currentUserId) return;
    closedRows.set(currentUserId, true);
    void AsyncStorage.setItem(closedKey(currentUserId), new Date().toISOString()).catch(() => undefined);
    emitRows();
  }, [currentUserId]);
  const source: AutoLogSource | null = auto.apple ? 'apple-health' : auto.whoop ? 'whoop' : null;
  return { auto, source, offer: auto.ready && !auto.connected && !!source && !closed, close };
}
