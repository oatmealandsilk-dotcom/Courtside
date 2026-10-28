import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { isSupabaseConfigured } from '@/lib/supabase';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks): pictures of "unlock courts" for
 * the owner to approve before anything is built (Oct 27: "people can unlock a
 * court if the log a hit there and there can be gratifications there").
 * Everything here is made-up sample data for the demo build; none of it is
 * real, none of it reaches the database, and none of it may reach main.
 */

/** On only in the demo build (no database): the pictures are taken there. */
export const DESIGN_UNLOCKS = !isSupabaseConfigured;

/** The demo courts Alex has unlocked (by name: the map folds a park's courts into one pin). */
const UNLOCKED_NAMES = new Set(['Alder Park', 'Cypress Hollow Park', 'Juniper Community Park', 'Marigold Park']);
export const isDesignUnlocked = (name?: string | null) => DESIGN_UNLOCKS && !!name && UNLOCKED_NAMES.has(name);

/** The court that lights up: people have tapped Light up there (shown to strangers as a number only). */
export const LIT_COURT = 'Alder Park';

export interface DesignCourt {
  name: string;
  /** Town, for a court away from home. */
  town?: string;
  surface: 'hard' | 'clay' | 'grass' | null;
  /** When it was unlocked, as the row says it. */
  since: string;
  sessions: number;
  crown?: boolean;
  isNew?: boolean;
  lat: number;
  lng: number;
}

/** Alex's courts, newest first. Two are away from home (a trip, a tournament). */
export const MY_COURTS: DesignCourt[] = [
  // The courts themselves sit a little south-east of the park's pin, in the open ground by Elysian Park Drive (the unlock pictures draw them there).
  { name: 'Juniper Community Park', surface: 'clay', since: 'Today', sessions: 1, isNew: true, lat: 34.08644, lng: -118.24431 },
  { name: 'Marigold Park', surface: null, since: 'Oct 9', sessions: 2, lat: 34.034, lng: -118.26 },
  { name: 'Cypress Hollow Park', surface: 'hard', since: 'Sep 21', sessions: 6, lat: 34.0736, lng: -118.23 },
  { name: 'Alder Park', surface: 'hard', since: 'Sep 2', sessions: 31, crown: true, lat: 34.0604, lng: -118.254 },
  { name: 'Pullen Park', town: 'Raleigh', surface: 'hard', since: 'Aug 14', sessions: 3, lat: 35.7796, lng: -78.6612 },
  { name: 'Harbor View Courts', town: 'San Diego', surface: 'hard', since: 'Jul 30', sessions: 1, lat: 32.7157, lng: -117.1611 },
];

/** Courts near home not yet unlocked: public ones only (a members' club or someone's own court is never suggested). */
export const TO_UNLOCK = [
  { name: 'Bellwood Recreation Center', miles: '1.6 mi', courts: 2 },
  { name: 'Larkspur Recreation Center', miles: '2.4 mi', courts: 2 },
];

/** The court badges (owner's brief: 5 / 10 / 25 / 50 courts). */
export const BADGES = [5, 10, 25, 50] as const;
export const BADGE_EARNED: Record<number, string | undefined> = { 5: 'Oct 9' };

/** Weeks with at least one session, oldest first (this week last): a 4-week run. */
export const WEEKS = [true, false, true, false, true, true, true, true];
export const WEEKS_IN_A_ROW = 4;

/** King of the Court this month (most hits logged at one court in the month). */
export const KING = { court: 'Alder Park', hits: 9, month: 'October', next: 6 };

/** The next profile card (cards come out after launch; days played this month). */
export const NEXT_CARD = { name: 'Full colour', have: 5, need: 8 };

/*
 * Round 2 (owner, Oct 27): "Regulars here" on a court's card, the louder
 * Court unlocked, and Your courts as a collection. Still made-up data.
 */

/** The demo player's friends (they follow each other): the only people the card may show as at a court now. */
export const DESIGN_FRIENDS = new Set(['u-sam', 'u-marcus', 'u-omar']);

/**
 * "Regulars here": people who chose to mark a court as one of theirs,
 * friends first. Ella is a teen and not a friend, so she is counted but
 * never shown. `hereNow` is a number only; a friend here now is named
 * (`friendsHere`), a stranger never is.
 */
export const DESIGN_REGULARS: Record<string, { ids: string[]; hereNow: number; friendsHere: string[] }> = {
  'Alder Park': { ids: ['u-sam', 'u-marcus', 'u-omar', 'u-priya', 'u-noor', 'u-lena', 'u-ella', 'u-theo', 'u-bea', 'u-jonah', 'u-ivy', 'u-diego'], hereNow: 3, friendsHere: ['u-sam'] },
  'Cypress Hollow Park': { ids: ['u-marcus', 'u-rosa', 'u-kai', 'u-noor', 'u-omar', 'u-ivy', 'u-jonah'], hereNow: 2, friendsHere: [] },
  'Juniper Community Park': { ids: ['u-sam', 'u-theo', 'u-bea', 'u-diego'], hereNow: 0, friendsHere: [] },
  'Marigold Park': { ids: ['u-lena', 'u-priya', 'u-kai'], hereNow: 0, friendsHere: [] },
  'Bellwood Recreation Center': { ids: ['u-marcus', 'u-rosa', 'u-kai', 'u-theo', 'u-ivy'], hereNow: 2, friendsHere: ['u-marcus'] },
  'Larkspur Recreation Center': { ids: ['u-omar', 'u-bea', 'u-jonah'], hereNow: 0, friendsHere: [] },
};

/** Courts you marked as one of yours in this visit (Add yourself). */
const regularAt = new Set<string>();
const regularListeners = new Set<() => void>();
export const isDesignRegular = (court: string) => regularAt.has(court);
export function setDesignRegular(court: string, on: boolean) {
  if (on) regularAt.add(court); else regularAt.delete(court);
  regularListeners.forEach((l) => l());
}
export function subscribeDesignRegular(l: () => void) {
  regularListeners.add(l);
  return () => { regularListeners.delete(l); };
}

/**
 * How many players have each court unlocked, and the friends among them
 * (names only of friends; everyone else is a number).
 */
export const HAVE_IT: Record<string, { friends: string[]; total: number }> = {
  'Juniper Community Park': { friends: ['u-sam', 'u-marcus'], total: 42 },
  'Marigold Park': { friends: ['u-omar'], total: 17 },
  'Cypress Hollow Park': { friends: ['u-marcus', 'u-omar'], total: 64 },
  'Alder Park': { friends: ['u-sam', 'u-marcus', 'u-omar'], total: 118 },
  'Pullen Park': { friends: [], total: 23 },
  'Harbor View Courts': { friends: [], total: 9 },
  'Bellwood Recreation Center': { friends: ['u-marcus'], total: 12 },
  'Larkspur Recreation Center': { friends: ['u-omar', 'u-sam'], total: 31 },
};

/*
 * Round 3 (owner, Oct 28): "the court unlocked looks better, but im not the
 * biggest fan of the badge on the bottom right. or the court icon on the top.
 * show me a couple to pick from." Three ways to tell it, one shown at a time:
 *   A  Traced: the court's own block of map close up, the courts drawn on it
 *      in your colour at their real size, "6th court" in big type.
 *   B  Card: the court comes as a collectible card that flips over.
 *   C  Your map: the new court lights up, then the map pulls back to show
 *      all your courts, the new one among them.
 * The demo's pictures pick one with ?v=A, ?v=B or ?v=C; this is the rest
 * (owner, Oct 28: "C your map").
 */
export type UnlockOption = 'A' | 'B' | 'C';
export const COURT_UNLOCKED_OPTION: UnlockOption = 'C';
export const unlockOption = (v?: string | string[]): UnlockOption => {
  const one = Array.isArray(v) ? v[0] : v;
  return one === 'A' || one === 'B' || one === 'C' ? one : COURT_UNLOCKED_OPTION;
};

/** The new court's facts, as the Court unlocked moment says them (made up). */
export const NEW_COURT_FACTS = { surface: 'Clay', courts: 3, fromHome: '2.1 mi', day: 'Oct 27', city: 'Los Angeles' };

/** Where the courts still to unlock are, for their map patches. */
export const TO_UNLOCK_AT: Record<string, { lat: number; lng: number }> = {
  'Bellwood Recreation Center': { lat: 34.0406, lng: -118.221 },
  'Larkspur Recreation Center': { lat: 34.0186, lng: -118.233 },
};

/** The order each court was unlocked in (No. 1 the first): newest first in MY_COURTS. */
export const courtNumber = (name: string) => MY_COURTS.length - MY_COURTS.findIndex((c) => c.name === name);

/** In the demo build only: the screenshot script moves around the app without reloading it (a reload signs the demo out). */
export function useDesignNavHook() {
  useEffect(() => {
    if (Platform.OS !== 'web' || !DESIGN_UNLOCKS || typeof window === 'undefined') return;
    (window as unknown as { __csGo?: (href: string) => void }).__csGo = (href: string) => router.push(href as never);
  }, []);
}

/** In the demo build only: the full map, so the screenshot script can frame the courts. */
export function exposeDesignMap(instance: unknown, expanded: boolean) {
  if (Platform.OS !== 'web' || !DESIGN_UNLOCKS || !expanded || typeof window === 'undefined') return;
  (window as unknown as { __csMap?: unknown }).__csMap = instance;
}
