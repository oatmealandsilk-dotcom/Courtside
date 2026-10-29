import { useSyncExternalStore } from 'react';
import { learned as learnedTip } from '@/features/tips/tips';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import type { CourtAccess, MapVisibility, User } from '@/data/types';
import { isDemo } from '@/features/activity/flags';
import { notKnownAdult } from '@/features/players/age';

/*
 * "Who can see you on the map?" (migration 63; a plain yes or no since
 * migration 189, after Apple's 5.1.2(i) review), and the one tip after it.
 *
 * The first time someone taps Check in without a yes, the question comes
 * first (the screen at app/map-visibility), then Apple's own location
 * prompt, then the check-in and one tip by the Check in button: "Tap here
 * any time to check out." Said no (or closed it): nothing is shared. The
 * same screen opens later from Settings → Privacy and your own card.
 */

/**
 * The two answers, in the screen's order. Friends: your pin, after you tap
 * Check in and until 10pm, to friends who follow each other with you. No
 * one: never on the map. ('nearby', an answer from before 189, reads as
 * Friends: the server treats it so.)
 */
export const CONSENT_CHOICES: { value: MapVisibility; label: string; line: string }[] = [
  { value: 'mutuals', label: 'Friends · people you both follow', line: 'Only when you tap Up to hit, till 10pm.' },
  { value: 'none', label: 'No one', line: 'You never show on the map.' },
];

/**
 * The yes on the first ask, "Let friends see you're up to hit?" ("Let friends
 * see where you are?" when anything else asked; Oct 28, the small version): it
 * saves Friends ('mutuals'), the same answer as Settings → Privacy's
 * "Friends · people you both follow".
 */
export const FIRST_YES = 'Turn on';

/** What a teen is told the first time, before anything is shared (the owner's words). */
export const TEEN_NOTICE = 'Only friends who follow you back can see where you are. Tap Turn off on the map anytime to hide.';

/** Whether friends may see your check-ins: a yes ('mutuals', or 'nearby' from before migration 189). */
export const saidYes = (v: MapVisibility | null | undefined) => v === 'mutuals' || v === 'nearby';

/** The answer as a settings row says it. No answer yet: No one (nothing is shared until a yes). */
export const visibilityLabel = (v: MapVisibility | null | undefined, _teen = false) =>
  (saidYes(v) ? 'Friends' : 'No one');

/**
 * Where someone not known to be an adult stands with the map (migration
 * 78): 'off' on a database without it (they are never on the map, and see
 * only themselves), or 'on' (only between friends who follow each other).
 * Since migration 119 under 16s are 'on' too, with the same rule as 16 and
 * 17 year olds: off until they turn it on, then only people they follow who
 * follow them back.
 */
export type TeenMap = 'off' | 'on';

/**
 * Whether there is a choice to make here at all: the map's round 2 is on
 * the database, and you are known to be an adult, or (migration 78) a teen
 * (any age, since 119), or anyone with no age on file, who may share with
 * friends who follow them back.
 */
export const canChooseVisibility = (mapLive: boolean | null, me: User | null | undefined, teenMap: TeenMap) =>
  mapLive === true && !!me && (!notKnownAdult(me) || teenMap === 'on');

/**
 * Who sees you checked in at a court, once you have said (migration 63): your
 * answer to "Who can see you on the map?", or null when there is no choice
 * to make yet (the server's default then: names to people who follow each
 * other with you, a count to anyone else).
 */
export const seenByOnMap = (mapLive: boolean | null, me: User | null | undefined, teenMap: TeenMap, mapVisibility: MapVisibility | null | undefined) =>
  (canChooseVisibility(mapLive, me, teenMap) ? mapVisibility ?? null : null);

/**
 * Whether "I'm playing here" is on offer at a court (the court sheet's rule,
 * app/court-now): never for someone not known to be an adult, whose spot is
 * never put on the map for anyone, nor at a club's or someone's home court.
 * The server holds the same rules ('adults_only', 'closed_court').
 */
export const canCheckIn = (me: User | null | undefined, access?: CourtAccess) =>
  !!me && !notKnownAdult(me) && access !== 'members' && access !== 'private';

/** Whether the map's teen rule (friends who follow each other only) applies to you. */
export const onTeenMap = (me: User | null | undefined, teenMap: TeenMap) => !!me && notKnownAdult(me) && teenMap === 'on';

/**
 * Why the map cannot show you "Players nearby" right now. Since migration
 * 98 you share to see: the server sends strangers only to someone with a
 * spot of their own on the map who did not choose Only me (friends who
 * follow each other with you show either way). 'location': Location is off
 * and the server has no spot for you; 'hidden': you chose Only me; null:
 * nothing holds them back. Only for a known adult on a real account: a teen
 * sees only friends whatever they do, and the demo shows everyone.
 */
export type NearbyLock = 'location' | 'hidden' | null;
/** Whether you must share your own spot to see players nearby (migration 98's rule; off since 105). */
const SHARE_TO_SEE = false;

export function nearbyLock(a: { mapLive: boolean | null; me: User | null | undefined; mapVisibility: MapVisibility | null | undefined; locationOn: boolean; hasSpot: boolean }): NearbyLock {
  // Off since migration 105 (Oct 5, owner: everyone visible for now): Location off or Only me no longer
  // hides players nearby from you, so there is nothing to say. Flip SHARE_TO_SEE back on with the near-you rule.
  if (!SHARE_TO_SEE) return null;
  if (a.mapLive !== true || !a.me || notKnownAdult(a.me) || isDemo(a.me.id)) return null;
  if (a.mapVisibility === 'none') return 'hidden';
  // A spot shared from another device still counts: the server measures from it.
  return !a.locationOn && !a.hasSpot ? 'location' : null;
}

/* ------------------------------------------------------------- the screen */

let waiting: ((v: MapVisibility | null) => void) | null = null;
// Whether the screen is up, for the map behind it (its first pins wait until it has gone).
const upListeners = new Set<() => void>();
const emitUp = () => upListeners.forEach((fn) => fn());
const subscribeUp = (fn: () => void) => { upListeners.add(fn); return () => { upListeners.delete(fn); }; };
/** Whether "Who can see you on the map?" is up right now. */
export function useWhoSeesYouUp(): boolean {
  return useSyncExternalStore(subscribeUp, () => waiting !== null, () => false);
}

/**
 * What opened the first ask, so it promises only what is true there: `uth`,
 * the Up to hit button (it ends by itself at 10pm, or after 2 hours late in
 * the day); `court`, I'm playing here on a court's sheet; `live`, Show friends
 * on a live session; `teenOpen`, a teen's Open to hit (it ends at the time
 * they picked); `reask`, the re-ask card's Turn on (nothing is shared yet).
 * Anything but `uth` reads the general words: only when you choose to share,
 * and it ends by itself (review, Oct 28).
 */
export type WhoSeesFrom = 'uth' | 'court' | 'live' | 'teenOpen' | 'reask';

/**
 * Opens "Who can see you on the map?". `first`: before the first Check in,
 * a yes or Not now (then Apple's prompt, with the check-in); `from` says what
 * asked. `manage`: the same two answers, saved as they are tapped. Resolves
 * with the answer, or null if it was closed without one.
 */
export function askWhoSeesYou(mode: 'first' | 'manage', from?: WhoSeesFrom): Promise<MapVisibility | null> {
  learnedTip('map-who-sees');
  // Only one at a time: a second tap while it is up opens nothing more.
  if (waiting) return Promise.resolve(null);
  return new Promise((resolve) => {
    waiting = resolve;
    emitUp();
    router.push({ pathname: '/map-visibility', params: from ? { mode, from } : { mode } });
  });
}

/**
 * Before anything that shows you to friends ("I'm playing here", Show friends
 * on a live session; Check in asks for itself): with no yes yet, "Who can
 * see you on the map?" first, every time, and nothing happens without a yes
 * (Apple 5.1.2(i): permission first, with a way to decline; migration 191
 * holds the same rule). Resolves whether to go on. No one: false, unasked
 * (the page already says it, and Settings changes it).
 */
export async function yesFirst(now: MapVisibility | null | undefined, from: WhoSeesFrom): Promise<boolean> {
  if (saidYes(now)) return true;
  if (now === 'none') return false;
  return saidYes(await askWhoSeesYou('first', from));
}

/** The screen has closed: with what was chosen, or null. */
export function settleWhoSeesYou(v: MapVisibility | null) {
  const done = waiting;
  waiting = null;
  if (done) emitUp();
  done?.(v);
}

/* ---------------------------------------------------------------- the tip */

/** Where the tip points: the Find Players card's Check in button, or the full map's. */
export type TipSpot = 'card' | 'map';

const TIP_KEY = 'courtside-hide-tip';
let tipAt: TipSpot | null = null;
/** What the tip says: how to hide again. */
let tipText = 'Tap here any time to turn it off.';
let tipSeen: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function readSeen(): Promise<boolean> {
  if (tipSeen !== null) return tipSeen;
  try {
    tipSeen = Platform.OS === 'web' ? localStorage.getItem(TIP_KEY) === 'seen' : (await AsyncStorage.getItem(TIP_KEY)) === 'seen';
  } catch { tipSeen = false; }
  return tipSeen;
}
function markSeen() {
  tipSeen = true;
  try {
    if (Platform.OS === 'web') localStorage.setItem(TIP_KEY, 'seen');
    else void AsyncStorage.setItem(TIP_KEY, 'seen').catch(() => {});
  } catch { /* the tip may show once more; nothing else depends on it */ }
}

/** Shows the tip once, ever, by that Check in button, after a first check-in. */
export async function showHideTip(where: TipSpot) {
  if (await readSeen()) return;
  markSeen();
  tipText = 'Tap here any time to turn it off.';
  tipAt = where;
  emit();
}

/** The tip's words, while it is up. */
export function useHideTipText(): string {
  return useSyncExternalStore(subscribe, () => tipText, () => tipText);
}

/** Puts the tip away (a tap anywhere on it, or on the button it points at). */
export function dismissHideTip() {
  if (tipAt === null) return;
  tipAt = null;
  emit();
}

/** Whether the tip is up by this button. */
export function useHideTip(where: TipSpot): boolean {
  return useSyncExternalStore(subscribe, () => tipAt === where, () => false);
}
