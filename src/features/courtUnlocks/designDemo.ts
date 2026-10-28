import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { userById } from '@/data/mock/users';
import type { User } from '@/data/types';
import { notKnownAdult } from '@/features/players/age';
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
 * A court's regulars: people who keep it as one of their courts (`ids`),
 * and which of them are at the court right now (`here`). Ella is
 * a teen and not a friend: never counted, never shown. The demo knows
 * everyone here by name; the real server sends only friends by name and
 * everyone else as one number (court_right_now, migration 189).
 */
export const DESIGN_REGULARS: Record<string, { ids: string[]; here: string[] }> = {
  // Two friends and three others here (Ella, a teen, is there too and never counted): "Sam, Marcus and 3 others".
  'Alder Park': { ids: ['u-sam', 'u-marcus', 'u-omar', 'u-priya', 'u-noor', 'u-lena', 'u-ella', 'u-theo', 'u-bea', 'u-jonah', 'u-ivy', 'u-diego'], here: ['u-sam', 'u-marcus', 'u-priya', 'u-theo', 'u-bea', 'u-ella'] },
  // Only people you don't know: "4 playing now".
  'Cypress Hollow Park': { ids: ['u-marcus', 'u-rosa', 'u-kai', 'u-noor', 'u-omar', 'u-ivy', 'u-jonah'], here: ['u-rosa', 'u-kai', 'u-noor', 'u-ivy'] },
  // One stranger alone: never counted, so it reads as nobody here.
  'Juniper Community Park': { ids: ['u-sam', 'u-theo', 'u-bea', 'u-diego'], here: ['u-diego'] },
  'Marigold Park': { ids: ['u-lena', 'u-priya', 'u-kai'], here: [] },
  'Bellwood Recreation Center': { ids: ['u-marcus', 'u-rosa', 'u-kai', 'u-theo', 'u-ivy'], here: [] },
  'Larkspur Recreation Center': { ids: ['u-omar', 'u-bea', 'u-jonah'], here: [] },
};

/**
 * Who is at a court right now, as anything next to that court may say it
 * (owner, Oct 28: "Just say number like x here."), the server's rule for
 * court counts (migration 189): friends (people who follow each other with
 * you) by face and first name; everyone else only as one number, and only
 * when it is 2 or more, so a lone stranger is never counted; a teen is
 * never counted for, or shown to, anyone but their friends. Only regulars
 * of the court.
 */
export function designHere(court: string): { friends: User[]; others: number } {
  const data = DESIGN_REGULARS[court];
  if (!data) return { friends: [], others: 0 };
  const there = data.here
    .filter((id) => data.ids.includes(id))
    .map((id) => userById(id))
    // A teen only for their friends (the server's rule): never counted for, or shown to, anyone else.
    .filter((u): u is User => !!u && (DESIGN_FRIENDS.has(u.id) || !notKnownAdult(u)));
  const friends = there.filter((u) => DESIGN_FRIENDS.has(u.id));
  const rest = there.length - friends.length;
  return { friends, others: rest >= 2 ? rest : 0 };
}

/** How many are at a court now, as the map and Your courts say it: the friends there and the others' number. */
export const designHereCount = (court: string) => {
  const { friends, others } = designHere(court);
  return friends.length + others;
};

/** "Sam", "Sam and Marcus", "Sam, Marcus and Omar". */
export const andList = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '');

/**
 * Who is there now, in words, never with a plus (owner, Oct 28: "I don't
 * like the regulars here and it says +4"): up to two friends by first name
 * (three when that is everyone), everyone else in plain words. `lead` is the
 * names, `tail` the rest: "Sam, Marcus" + " and 3 others", "Sam and Marcus" + "".
 */
export function hereWords(friends: User[], others: number) {
  const firsts = friends.map((u) => u.name.split(' ')[0]);
  const named = firsts.length === 3 && !others ? firsts : firsts.slice(0, 2);
  const rest = firsts.length - named.length + others;
  const lead = rest ? named.join(', ') : andList(named);
  const tail = rest ? ` and ${rest} ${rest === 1 ? 'other' : 'others'}` : '';
  return { lead, tail, total: firsts.length + others };
}

/*
 * Round 5 (owner, Oct 28, on the round 4 board: "I don't like the regulars
 * here and it says +4"): three calmer ways for a court's card to say who is
 * there now. No "Regulars" heading, no plus, no pill of a number:
 *   a  One line: under the name, "Sam, Marcus and 3 others playing now",
 *      friends' small faces before it; "4 playing now"; "No one playing
 *      right now". Add yourself is the heart by Send and Close (it already
 *      keeps the court in Your courts, so the two were one job).
 *   b  Here now: a small row, friends' faces with their names, then "and 3
 *      others" in words; "Here now · 4 players"; "No one here right now".
 *      Add yourself is the heart, as in a.
 *   c  Two chips under the name: "5 playing now" (friends' tiny faces in it,
 *      their names on a tap) and "My court" (the heart, with a word).
 * The demo build on the web picks one with localStorage 'courtside-courtcard'
 * = a, b or c; otherwise COURT_CARD_OPTION.
 */
export type CourtCardOption = 'a' | 'b' | 'c';
export const COURT_CARD_OPTION: CourtCardOption = 'a';
export function courtCardOption(): CourtCardOption {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const v = window.localStorage.getItem('courtside-courtcard');
      if (v === 'a' || v === 'b' || v === 'c') return v;
    } catch {
      // Storage blocked: the default.
    }
  }
  return COURT_CARD_OPTION;
}

/** The note beside a lit court on the map and at the foot of Your courts' cards, in the card's own words: "5 playing" (a, c) or "5 here" (b). */
export const hereTag = (n: number) => `${n} ${courtCardOption() === 'b' ? 'here' : 'playing'}`;

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
