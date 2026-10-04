import { useSyncExternalStore } from 'react';
import { learned as learnedTip } from '@/features/tips/tips';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import type { MapVisibility, User } from '@/data/types';
import { notKnownAdult } from '@/features/players/age';

/*
 * "Who can see you on the map?" (migration 63), and the one tip after it.
 *
 * The first time someone turns Location on, or opens the full map, without
 * ever having chosen, the choice comes first (the screen at
 * app/map-visibility), then Apple's own location prompt, then one tip
 * pointing at the location button: "Tap here any time to hide yourself."
 * The same screen opens later from that button on the full map, from your
 * own card on the map, and from Settings → Privacy.
 */

/**
 * The three answers, in the screen's order, with the words it uses. Players
 * nearby: a rough area to everyone (the court too, while you check in
 * there: migration 63), your exact spot to people you follow back.
 */
export const VISIBILITY_CHOICES: { value: MapVisibility; label: string; line: string }[] = [
  { value: 'nearby', label: 'Players nearby', line: 'Your rough area, or your court when you check in. Exact for people you follow back.' },
  { value: 'mutuals', label: 'Only people you follow back', line: 'Your exact spot, just for them.' },
  { value: 'none', label: 'Only me', line: 'No one sees you on the map.' },
];

/**
 * The two answers for someone not known to be an adult (migration 78): the
 * map is only ever between friends who follow each other, so there is no
 * "Players nearby", and their spot is only ever their rough area.
 */
export const TEEN_CHOICES: { value: MapVisibility; label: string; line: string }[] = [
  { value: 'mutuals', label: 'Friends who follow you back', line: 'Your rough area, just for them. Strangers never see you.' },
  { value: 'none', label: 'Only me', line: 'No one sees you on the map.' },
];

/** What a teen is told the first time, before anything is shared (the owner's words). */
export const TEEN_NOTICE = 'Only friends who follow you back can see where you are. Turn off location on the map anytime to hide.';

/** The choices to offer: the adults' three, or the teens' two. */
export const choicesFor = (teen: boolean) => (teen ? TEEN_CHOICES : VISIBILITY_CHOICES);

/**
 * The answer as a settings row says it: the screen's own words, so the two
 * never differ. For a teen, no answer yet means nobody sees them (Only me).
 */
export const visibilityLabel = (v: MapVisibility | null | undefined, teen = false) => {
  if (teen) return (v === 'nearby' || v === 'mutuals' ? TEEN_CHOICES[0] : TEEN_CHOICES[1]).label;
  return (VISIBILITY_CHOICES.find((c) => c.value === (v ?? 'nearby')) ?? VISIBILITY_CHOICES[0]).label;
};

/**
 * Where someone not known to be an adult stands with the map (migration
 * 78): 'off' on a database without it (they are never on the map, and see
 * only themselves), 'on' (only between friends who follow each other), or
 * 'under16' (a birthday on file says under 16: never on the map).
 */
export type TeenMap = 'off' | 'on' | 'under16';

/**
 * Whether there is a choice to make here at all: the map's round 2 is on
 * the database, and you are known to be an adult, or (migration 78) a teen
 * of 16 or 17, or anyone with no age on file, who may share with friends
 * who follow them back.
 */
export const canChooseVisibility = (mapLive: boolean | null, me: User | null | undefined, teenMap: TeenMap) =>
  mapLive === true && !!me && (!notKnownAdult(me) || teenMap === 'on');

/** Whether the map's teen rule (friends who follow each other only) applies to you. */
export const onTeenMap = (me: User | null | undefined, teenMap: TeenMap) => !!me && notKnownAdult(me) && teenMap === 'on';

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
 * Opens "Who can see you on the map?". `first`: the first-time screen, with
 * Continue (and then Apple's prompt, if Location is off). `manage`: the same
 * choices, saved as they are tapped, with Location off at the bottom.
 * Resolves with the answer, or null if it was closed without one.
 */
export function askWhoSeesYou(mode: 'first' | 'manage'): Promise<MapVisibility | null> {
  learnedTip('map-who-sees');
  // Only one at a time: a second tap while it is up opens nothing more.
  if (waiting) return Promise.resolve(null);
  return new Promise((resolve) => {
    waiting = resolve;
    emitUp();
    router.push({ pathname: '/map-visibility', params: { mode } });
  });
}

let launchAsked = false;
/**
 * Someone already sharing their location who has never answered (from
 * before the map asked, or from an older version of the app): asked once
 * each time the app is opened, until they answer, then the tip. Until then
 * the server keeps them to about a kilometre for everyone, as before.
 */
export async function askWhoSeesYouOnLaunch(where: TipSpot): Promise<void> {
  if (launchAsked) return;
  launchAsked = true;
  const chose = await askWhoSeesYou('first');
  if (chose) void showHideTip(where, chose);
}

/** The screen has closed: with what was chosen, or null. */
export function settleWhoSeesYou(v: MapVisibility | null) {
  const done = waiting;
  waiting = null;
  if (done) emitUp();
  done?.(v);
}

/* ---------------------------------------------------------------- the tip */

/** Where the tip points: the Find Players card's location switch, or the full map's location button. */
export type TipSpot = 'card' | 'map';

const TIP_KEY = 'courtside-hide-tip';
let tipAt: TipSpot | null = null;
/** What the tip says: how to hide, or, for someone who chose Only me (already hidden), how to change it. */
let tipText = 'Tap here any time to hide yourself.';
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

/** Shows the tip once, ever, by that location button. `chose`: the answer just given (Only me gets the other line). */
export async function showHideTip(where: TipSpot, chose?: MapVisibility | null) {
  if (await readSeen()) return;
  markSeen();
  tipText = chose === 'none' ? 'Tap here to change who sees you.' : 'Tap here any time to hide yourself.';
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
