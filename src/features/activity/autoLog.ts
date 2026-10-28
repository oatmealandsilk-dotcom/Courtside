import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { appleHealthAvailable } from '@/features/health/appleHealth';
import { useApp } from '@/store/AppContext';
import { isDemo, isTracker, knownTennisFlags, tennisFlags, type TennisFlags } from './flags';
import { shownTo } from './autoLogSharing';
import type { AutoLogAudience } from '@/data/types';

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
  /**
   * Connects a source with every workout (or tennis alone, where every workout is not switched on). Throws when it did not go through.
   * `told`: the screen said who will see the tennis that logs itself (consentLine), so connecting is the player's yes to it
   * (migration 193): a choice never made is saved as that, and Apple Health's sessions follow it.
   */
  connect: (source: AutoLogSource, opts?: { told?: boolean }) => Promise<void>;
  /** Who will see the tennis that logs itself once connected, for the consent line: the choice made, else Friends. */
  seenBy: AutoLogAudience;
}

export function useAutoLog(): AutoLog {
  const { currentUserId, currentUser, integrations, healthIsReal, actions, autoLogSharing } = useApp();
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
  const seenBy = shownTo(autoLogSharing, null, currentUser);
  const connect = useCallback(async (source: AutoLogSource, opts?: { told?: boolean }) => {
    await actions.turnOnTennis(source, { workouts: source === 'apple-health' ? workoutsApple : workoutsWhoop });
    if (opts?.told && autoLogSharing === null) void actions.setAutoLogSharing(seenBy);
  }, [actions, workoutsApple, workoutsWhoop, autoLogSharing, seenBy]);
  // A real account's connections are known once its Health page data has loaded (healthIsReal); the demo's at once.
  return { ready: !!flags && (demo || !!healthIsReal), known: !!flags, apple, whoop, connected, connect, seenBy };
}

/*
 * Activities' slim "Connect Apple Health to log automatically" row (owner,
 * Oct 6: a friend who joined that day followed six people, so he never saw
 * it). Now it shows whenever nothing brings sessions in, however many people
 * you follow, until its × closes it on this phone. Settings → Health and
 * nutrition still connects.
 *
 * Profile's "Log your hits automatically" card (owner, Oct 24: "I like the
 * small card on profile") is the same offer in a second place, with its own
 * ×: closing one leaves the other.
 */
export type ConnectPlace = 'activities' | 'profile';
const closedKey = (place: ConnectPlace, userId: string) => (place === 'activities' ? `courtside.autoLogRow.closed:${userId}` : `courtside.autoLogProfile.closed:${userId}`);
/** Per place and account: true closed, false open, missing still being read. */
const closedRows = new Map<string, boolean>();
const readingRows = new Set<string>();
const rowListeners = new Set<() => void>();
const emitRows = () => rowListeners.forEach((fn) => fn());
const subscribeRows = (fn: () => void) => { rowListeners.add(fn); return () => { rowListeners.delete(fn); }; };

function readClosed(place: ConnectPlace, userId: string) {
  const at = `${place}:${userId}`;
  if (closedRows.has(at) || readingRows.has(at)) return;
  readingRows.add(at);
  void AsyncStorage.getItem(closedKey(place, userId))
    .then((raw) => { closedRows.set(at, closedRows.get(at) === true || raw !== null); }, () => { if (!closedRows.has(at)) closedRows.set(at, false); })
    .finally(() => { readingRows.delete(at); emitRows(); });
}

export interface ConnectRow {
  auto: AutoLog;
  /** What the row connects: Apple Health where it can, else WHOOP. */
  source: AutoLogSource | null;
  /** The row shows: something to connect, nothing connected, and not closed on this phone. */
  offer: boolean;
  /** The row's ×. */
  close: () => void;
  /** Everything `offer` depends on has been heard (switches, connections, this phone's ×), so it is the final word. */
  known: boolean;
}

/**
 * Asked as the tabs first open (app/(tabs)/_layout), so Profile's card is
 * already decided when Profile is first shown, instead of hearing it a beat
 * after and staying away for that visit (see ConnectCard).
 */
export function warmConnectOffer(userId: string) {
  readClosed('profile', userId);
  readClosed('activities', userId);
  void tennisFlags(userId);
}

export function useConnectRow(place: ConnectPlace = 'activities'): ConnectRow {
  const auto = useAutoLog();
  const { currentUserId } = useApp();
  useEffect(() => { if (currentUserId) readClosed(place, currentUserId); }, [place, currentUserId]);
  // Not offered until this phone has said whether it was closed, so it never flashes up and away.
  const closed = useSyncExternalStore(subscribeRows, () => (currentUserId ? closedRows.get(`${place}:${currentUserId}`) ?? true : true), () => true);
  const close = useCallback(() => {
    if (!currentUserId) return;
    closedRows.set(`${place}:${currentUserId}`, true);
    void AsyncStorage.setItem(closedKey(place, currentUserId), new Date().toISOString()).catch(() => undefined);
    emitRows();
  }, [place, currentUserId]);
  const source: AutoLogSource | null = auto.apple ? 'apple-health' : auto.whoop ? 'whoop' : null;
  const closedKnown = useSyncExternalStore(subscribeRows, () => !!currentUserId && closedRows.has(`${place}:${currentUserId}`), () => false);
  return { auto, source, offer: auto.ready && !auto.connected && !!source && !closed, close, known: auto.ready && closedKnown };
}
