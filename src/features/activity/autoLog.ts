import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { router } from 'expo-router';

import { appleHealthAvailable } from '@/features/health/appleHealth';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { isDemo, isTracker, knownTennisFlags, tennisFlags, type TennisFlags } from './flags';
import { friendsAtMost, onConnect, savesOnConnect, shownTo } from './autoLogSharing';
import { knownTrackerStatus, trackerStatus } from './trackers';
import type { AutoLogAudience, User } from '@/data/types';
import { warmWatchTip } from './watchTip';

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
  /** Fitbit can be connected: the server has its keys and its switch is on for this person. Connected from the Health page (its own sign-in). */
  fitbit: boolean;
  /** Something already brings sessions in (Apple Health, WHOOP or a tracker): nothing to offer. */
  connected: boolean;
  /**
   * Connects a source with every workout (or tennis alone, where every workout is not switched on). Throws when it did not go through.
   * `told`: the screen said friends will see the tennis that logs itself (consentLine of seenBy), so connecting WHOOP is the
   * player's yes to it (migration 193): a choice never made is saved as Friends. Never for Apple Health (Apple's 5.1.3: its
   * choice is made with a no beside it, on "Tennis logged" or in Settings).
   */
  connect: (source: AutoLogSource, opts?: { told?: boolean }) => Promise<void>;
  /** Who will see the tennis that logs itself once `source` is connected, for the line said first (autoLogSharing onConnect). */
  seenBy: (source: AutoLogSource) => AutoLogAudience;
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
  // Fitbit's sign-in is open when the server has its keys: asked only of someone its switch is on for.
  const fitbitFlag = !!flags?.fitbit;
  // null: not heard yet. Seeded from the last answer on this phone, so a repeat open knows at once.
  const [fitbitOpen, setFitbitOpen] = useState<boolean | null>(() => (demo ? true : knownTrackerStatus()?.fitbit ?? null));
  useEffect(() => {
    if (!fitbitFlag) return undefined;
    let on = true;
    void trackerStatus(currentUserId).then((t) => { if (on) setFitbitOpen(t.fitbit); });
    return () => { on = false; };
  }, [fitbitFlag, currentUserId]);
  const fitbit = fitbitFlag && fitbitOpen === true;
  // Where Fitbit's switch is on, nothing is final until its sign-in is known to be open or not (review, Oct 28): else
  // the choices (and the card's words and tap) changed after the card was up, or the card dropped in late.
  const fitbitHeard = !fitbitFlag || fitbitOpen !== null;
  const connected = integrations.some((i) => i.connected && !!i.readsWorkouts && (i.provider === 'apple-health' || i.provider === 'whoop' || isTracker(i.provider)));
  const workoutsApple = !!flags?.workoutsApple;
  const workoutsWhoop = !!flags?.workoutsWhoop;
  const seenBy = useCallback((source: AutoLogSource) => onConnect(autoLogSharing, source, currentUser), [autoLogSharing, currentUser]);
  const connect = useCallback(async (source: AutoLogSource, opts?: { told?: boolean }) => {
    await actions.turnOnTennis(source, { workouts: source === 'apple-health' ? workoutsApple : workoutsWhoop });
    if (opts?.told && savesOnConnect(autoLogSharing, source)) void actions.setAutoLogSharing('mutuals');
  }, [actions, workoutsApple, workoutsWhoop, autoLogSharing]);
  // A real account's connections are known once its Health page data has loaded (healthIsReal); the demo's at once.
  return { ready: !!flags && fitbitHeard && (demo || !!healthIsReal), known: !!flags && fitbitHeard, apple, whoop, fitbit, connected, connect, seenBy };
}

/*
 * "Connect your watch" (owner, Oct 28: "Auto log should be very pushed hard, how does Strava make sure everyone
 * auto logs"; 18 of 90 players had connected anything). The reminder card at the top of Activities and on your
 * own Profile, for anyone with nothing bringing sessions in. It was once a slim row and a small card, each with a
 * × that closed it for good; now "Not now" puts it away for NOT_NOW_MS and then it comes back, until something
 * is connected (never again after that). Each place has its own Not now.
 *
 * What it offers is what this phone can connect: Apple Health on an iPhone (never on Android or the website),
 * WHOOP or Fitbit where they are switched on for the player. On an iPhone the tap connects Apple Health at once, as
 * the old row did (15 of the first 18 connections came that way); the Health page still lists WHOOP and Fitbit.
 * Without Apple Health, one choice connects in one tap (Fitbit's goes to its own sign-in on the Health page); more
 * than one opens the Health page, which has a row for each.
 */
export type ConnectPlace = 'activities' | 'profile';
/** "Not now" puts the card away this long; then it comes back (at most once a day, on a visit). */
export const NOT_NOW_MS = 2 * 86_400_000;
const closedKey = (place: ConnectPlace, userId: string) => (place === 'activities' ? `courtside.autoLogRow.closed:${userId}` : `courtside.autoLogProfile.closed:${userId}`);
/** Per place and account: when "Not now" was last tapped (ms; 0 never), missing while still being read. */
const closedRows = new Map<string, number>();
const readingRows = new Set<string>();
const rowListeners = new Set<() => void>();
const emitRows = () => rowListeners.forEach((fn) => fn());
const subscribeRows = (fn: () => void) => { rowListeners.add(fn); return () => { rowListeners.delete(fn); }; };

/** The saved time of the last "Not now" (an ISO date, as the old × saved too: those come back two days after). */
const closedAt = (raw: string | null): number => {
  if (raw === null) return 0;
  const at = Date.parse(raw);
  // Something unreadable: taken as just now, so it is put away rather than shown over a choice it cannot read.
  return Number.isFinite(at) ? at : Date.now();
};

function readClosed(place: ConnectPlace, userId: string) {
  const at = `${place}:${userId}`;
  if (closedRows.has(at) || readingRows.has(at)) return;
  readingRows.add(at);
  void AsyncStorage.getItem(closedKey(place, userId))
    .then((raw) => { closedRows.set(at, Math.max(closedRows.get(at) ?? 0, closedAt(raw))); }, () => { if (!closedRows.has(at)) closedRows.set(at, 0); })
    .finally(() => { readingRows.delete(at); emitRows(); });
}

/** Something the card can connect. */
export type ConnectSource = AutoLogSource | 'fitbit';

const NAMES: Record<ConnectSource, string> = { 'apple-health': 'Apple Health', whoop: 'WHOOP', fitbit: 'your Fitbit' };

/** "Apple Health", "Apple Health or WHOOP", "Apple Health, WHOOP or your Fitbit". */
const namesOf = (choices: ConnectSource[]) => {
  const names = choices.map((c) => NAMES[c]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? '';
};

/**
 * What the card's tap connects at once: Apple Health wherever it is a choice (an iPhone), else the one choice when
 * there is one and it is not Fitbit (whose own sign-in is on the Health page). Null: the tap opens the Health page.
 */
export const tapConnects = (choices: ConnectSource[]): AutoLogSource | null => (
  choices.includes('apple-health') ? 'apple-health' : choices.length === 1 && choices[0] === 'whoop' ? 'whoop' : null
);

/**
 * The card's line: what the tap connects, and who will see the tennis that logs itself, said honestly before
 * connecting (migration 193). One tap from the card never chooses who sees it (review, Oct 28): not chosen yet, it is
 * asked on "Tennis logged" (Friends or Only me) or in Settings, so the card says "You choose who sees it". Where the
 * tap opens the Health page instead (WHOOP or Fitbit, no Apple Health), connecting there saves Friends when nothing is
 * chosen, that page saying so first, so the card says the same.
 */
export function connectLine(choices: ConnectSource[], chosen: AutoLogAudience | null | undefined, user: Pick<User, 'ageGroup'> | null | undefined): string {
  const tap = tapConnects(choices);
  const from = `Your tennis logs itself from ${tap === 'apple-health' ? 'Apple Health' : namesOf(choices)}.`;
  const numbers = friendsAtMost(user) ? '' : ', with its heart rate and calories';
  if (!chosen) {
    const viaPage = !tap && onConnect(chosen, choices[0], user) !== 'private';
    return viaPage ? `${from} Friends who follow you back see it${numbers}.` : `${from} You choose who sees it.`;
  }
  const seen = shownTo(chosen, null, user);
  return seen === 'private' ? `${from} Only you see it.`
    : seen === 'public' ? `${from} It goes on your profile${numbers}.`
    : `${from} Friends who follow you back see it${numbers}.`;
}

export interface ConnectRow {
  auto: AutoLog;
  /** What a tap connects: the one choice, or the first of several (which open the Health page). */
  source: ConnectSource | null;
  /** Everything this phone can connect, Apple Health first. */
  choices: ConnectSource[];
  /** The card shows: something to connect, nothing connected, and no "Not now" in the last two days on this phone. */
  offer: boolean;
  /** The card's "Not now". */
  close: () => void;
  /** Everything `offer` depends on has been heard (switches, connections, this phone's Not now), so it is the final word. */
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
  // Fitbit's sign-in asked now too where its switch is on, so the card's choices are final before a page asks.
  void tennisFlags(userId).then((f) => (f.fitbit ? trackerStatus(userId) : undefined)).catch(() => undefined);
  warmWatchTip(userId);
}

/** What this phone can connect, Apple Health first (an iPhone only), then WHOOP and Fitbit where they are switched on. */
export const connectChoices = (auto: Pick<AutoLog, 'apple' | 'whoop' | 'fitbit'>): ConnectSource[] => [
  ...(auto.apple ? ['apple-health' as const] : []),
  ...(auto.whoop ? ['whoop' as const] : []),
  ...(auto.fitbit ? ['fitbit' as const] : []),
];

export function useConnectRow(place: ConnectPlace = 'activities'): ConnectRow {
  const auto = useAutoLog();
  const { currentUserId } = useApp();
  useEffect(() => { if (currentUserId) readClosed(place, currentUserId); }, [place, currentUserId]);
  // Not offered until this phone has said when it was last put away, so it never flashes up and away.
  const closed = useSyncExternalStore(subscribeRows, () => {
    const at = currentUserId ? closedRows.get(`${place}:${currentUserId}`) : undefined;
    return at === undefined || (at > 0 && Date.now() - at < NOT_NOW_MS);
  }, () => true);
  const close = useCallback(() => {
    if (!currentUserId) return;
    const now = Date.now();
    closedRows.set(`${place}:${currentUserId}`, now);
    void AsyncStorage.setItem(closedKey(place, currentUserId), new Date(now).toISOString()).catch(() => undefined);
    emitRows();
  }, [place, currentUserId]);
  const choices = connectChoices(auto);
  const source = choices[0] ?? null;
  const closedKnown = useSyncExternalStore(subscribeRows, () => !!currentUserId && closedRows.has(`${place}:${currentUserId}`), () => false);
  return { auto, source, choices, offer: auto.ready && !auto.connected && !!source && !closed, close, known: auto.ready && closedKnown };
}

/**
 * The card's tap: Apple Health connects at once on an iPhone (the old row's one tap, review Oct 28); elsewhere one
 * choice connects at once (Fitbit opens the Health page, where its own sign-in is), and more than one opens the
 * Health page, which has a row for each. Connecting here never chooses who sees the tennis that logs itself.
 */
export function useConnectTap(row: Pick<ConnectRow, 'auto' | 'source' | 'choices'>): { busy: boolean; connect: () => void } {
  const [busy, setBusy] = useState(false);
  const connect = useCallback(() => {
    const { auto, source, choices } = row;
    if (!source || busy) return;
    haptics.tap();
    const now = tapConnects(choices);
    if (!now) { router.push('/health'); return; }
    setBusy(true);
    void auto.connect(now)
      .then(() => showToast({ title: now === 'whoop' ? 'WHOOP connected' : 'Apple Health connected', body: 'Your past week’s workouts show up in Notifications, ready to log.', icon: 'checkmark-circle-outline' }))
      .catch((err: unknown) => showToast({ title: 'Couldn’t connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' }))
      .finally(() => setBusy(false));
  }, [row, busy]);
  return { busy, connect };
}
