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
  { name: 'Juniper Community Park', surface: 'clay', since: 'Today', sessions: 1, isNew: true, lat: 34.0868, lng: -118.245 },
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
