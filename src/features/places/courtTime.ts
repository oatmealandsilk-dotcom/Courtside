import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clock } from '@/features/players/checkIn';

/*
 * "How long are you here?" (Oct 29, owner: "Right now if you tap in here at a
 * court, should a card pop up that's satisfying with a like + and - screen
 * that asks like how long you're going to be there", then "Build it").
 *
 * Every "I'm playing here" (the map's court card, the court sheet's switch,
 * the "You're at <court>? Light it up" row) opens one small card first:
 * − [1h 30m] +, in 30-minute steps from 30 minutes to 4 hours, then one big
 * "Light it up". It starts on 1h 30m, or on whatever this phone chose last.
 * The server holds the same limits whatever the app sends (migration 204).
 * Drawn once by the root layout (CourtTimeHost), over every sheet.
 */

export const COURT_TIME_MIN = 30;
export const COURT_TIME_MAX = 240;
export const COURT_TIME_STEP = 30;
/** Where the card starts the first time. */
export const COURT_TIME_PRESET = 90;

/** Held to the card's own steps, 30 minutes to 4 hours. */
export const clampCourtTime = (minutes: number) =>
  Math.min(COURT_TIME_MAX, Math.max(COURT_TIME_MIN, Math.round(minutes / COURT_TIME_STEP) * COURT_TIME_STEP));

/** "30m", "1h", "1h 30m", "4h": the card's big number. */
export function courtTimeWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** The same, for a screen reader: "1 hour 30 minutes". */
export function courtTimeSpoken(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : null, m ? `${m} minutes` : null].filter(Boolean).join(' ');
}

/** "till 6:30pm" for a time still to come; null once it has passed (or none). */
export function tillWords(until: string | null | undefined, now = Date.now()): string | null {
  const at = until ? Date.parse(until) : NaN;
  return Number.isFinite(at) && at > now ? `till ${clock(new Date(at))}` : null;
}

/* ------------------------------------------------------------ the last choice */

const KEY = 'courtside-court-time';
let last: number | null = null;

/** What this phone chose last time, else the preset. */
export async function lastCourtTime(): Promise<number> {
  if (last != null) return last;
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : await AsyncStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    last = Number.isFinite(n) ? clampCourtTime(n) : COURT_TIME_PRESET;
  } catch {
    last = COURT_TIME_PRESET;
  }
  return last;
}

function keepCourtTime(minutes: number) {
  last = minutes;
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, String(minutes));
    else void AsyncStorage.setItem(KEY, String(minutes)).catch(() => undefined);
  } catch { /* it starts on the preset next time; nothing else depends on it */ }
}

/* ------------------------------------------------------------------ the card */

/** Lit: when it ends, as the server said it (ISO time). */
export interface CourtTimeLit { until: string }

export interface CourtTimeRequest {
  /** The court's name, under the question ("Riverside Park"). */
  courtName: string;
  /** Where the card starts. */
  minutes: number;
  /**
   * Says you're playing there for that long: when it ends, as the server said it ({ until }), else a sentence
   * for the card. The card's "You're here · till 6:30pm" is that `until`, so it never says other than the map.
   */
  go: (minutes: number) => Promise<CourtTimeLit | string>;
  /** Lit (true), or put away (false). */
  done: (lit: boolean) => void;
}

let host: ((request: CourtTimeRequest) => void) | null = null;
let up = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The card registers itself here (CourtTimeHost). */
export function setCourtTimeHost(next: ((request: CourtTimeRequest) => void) | null) { host = next; }

/** The card tells whether it is up, so a sheet under it leaves Escape and outside taps to it. */
export function setCourtTimeUp(on: boolean) {
  if (up === on) return;
  up = on;
  emit();
}

/** Whether "How long are you here?" is up right now. */
export function useCourtTimeUp(): boolean {
  return useSyncExternalStore(subscribe, () => up, () => false);
}

/**
 * Opens "How long are you here?" for a court. `go` runs on Light it up with the minutes chosen; the card
 * stays up (with what went wrong) until it goes through or is put away. Resolves whether the court was lit.
 * With no card drawn (it never is before the app has), `go` runs at once for the last choice.
 */
export async function askCourtTime(courtName: string, go: (minutes: number) => Promise<CourtTimeLit | string>): Promise<boolean | string> {
  const minutes = await lastCourtTime();
  if (!host || up) {
    if (up) return false;
    const got = await go(minutes);
    return typeof got === 'string' ? got : true;
  }
  const show = host;
  return new Promise<boolean>((resolve) => {
    show({
      courtName,
      minutes,
      go: async (m) => {
        const got = await go(m);
        if (typeof got !== 'string') keepCourtTime(m);
        return got;
      },
      done: resolve,
    });
  });
}
