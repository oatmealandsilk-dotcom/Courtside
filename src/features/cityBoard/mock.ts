import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * City boards: DESIGN MOCK ONLY (branch design/city-board, Oct 27).
 *
 * Owner, Oct 27, of Find Players' "You're early in Raleigh" card: "makes the
 * app seem dead ... maybe we just replace it with the leaderboard that fades".
 * These screens exist to be photographed. They draw only in the demo build
 * (no Supabase), and only when the browser was told to show them:
 *
 *   localStorage['courtside-cityboard'] = 'board'   the leaderboard preview in place of the card
 *   localStorage['courtside-cityboard'] = 'early'   the old "You're early" card, forced (for a before picture)
 *   localStorage['courtside-cityboard-city'] = 'Raleigh'   whose city is "yours" on the boards
 *
 * Nobody on the live app, nor the auto-tester, ever sees any of it. The
 * numbers are made up; no real player's data is in here.
 */
export type CityBoardMock = 'off' | 'board' | 'early';

const read = (key: string): string | null => {
  if (isSupabaseConfigured || Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
};

export const CITY_BOARD_MOCK: CityBoardMock = (() => {
  const v = read('courtside-cityboard');
  return v === 'board' || v === 'early' ? v : 'off';
})();

/** The city the boards treat as yours, when the picture asks for one other than the demo profile's. */
export const MOCK_HOME_CITY: string | null = read('courtside-cityboard-city');

export interface BoardCity {
  id: string;
  name: string;
  state: string;
  /** Tennis sessions logged this month by players whose home city this is. */
  hits: number;
  /** Players who logged at least one this month. */
  players: number;
  /** Where it finished last month (for "up 2"). */
  lastRank: number;
}

/** October's board, made up. A young app's numbers: hundreds, not thousands. */
const CITIES: BoardCity[] = [
  { id: 'new-york', name: 'New York', state: 'NY', hits: 512, players: 88, lastRank: 1 },
  { id: 'austin', name: 'Austin', state: 'TX', hits: 473, players: 54, lastRank: 3 },
  { id: 'los-angeles', name: 'Los Angeles', state: 'CA', hits: 412, players: 71, lastRank: 2 },
  { id: 'chicago', name: 'Chicago', state: 'IL', hits: 288, players: 47, lastRank: 4 },
  { id: 'miami', name: 'Miami', state: 'FL', hits: 241, players: 35, lastRank: 6 },
  { id: 'seattle', name: 'Seattle', state: 'WA', hits: 197, players: 33, lastRank: 5 },
  { id: 'denver', name: 'Denver', state: 'CO', hits: 164, players: 21, lastRank: 7 },
  { id: 'raleigh', name: 'Raleigh', state: 'NC', hits: 96, players: 9, lastRank: 11 },
  { id: 'atlanta', name: 'Atlanta', state: 'GA', hits: 88, players: 15, lastRank: 8 },
  { id: 'san-diego', name: 'San Diego', state: 'CA', hits: 71, players: 13, lastRank: 9 },
  { id: 'boston', name: 'Boston', state: 'MA', hits: 64, players: 12, lastRank: 10 },
  { id: 'houston', name: 'Houston', state: 'TX', hits: 52, players: 10, lastRank: 12 },
  { id: 'phoenix', name: 'Phoenix', state: 'AZ', hits: 41, players: 8, lastRank: 14 },
  { id: 'nashville', name: 'Nashville', state: 'TN', hits: 37, players: 6, lastRank: 13 },
  { id: 'portland', name: 'Portland', state: 'OR', hits: 33, players: 7, lastRank: 15 },
  // Too few players to rank yet: shown only as "needs 2 more players".
  { id: 'cary', name: 'Cary', state: 'NC', hits: 14, players: 3, lastRank: 0 },
];

/** Cities with fewer players than this are not ranked (a city of two would show two people's logs). */
export const MIN_PLAYERS = 5;

export type BoardMode = 'total' | 'per';

export interface RankedCity extends BoardCity { rank: number; value: number; moved: number }

const perPlayer = (c: BoardCity) => Math.round((c.hits / c.players) * 10) / 10;

/** The month's board, best first: by hits, or by hits per player. */
export function rankCities(mode: BoardMode): RankedCity[] {
  const value = (c: BoardCity) => (mode === 'per' ? perPlayer(c) : c.hits);
  return CITIES.filter((c) => c.players >= MIN_PLAYERS)
    .map((c) => ({ ...c, value: value(c) }))
    .sort((a, b) => b.value - a.value || b.hits - a.hits)
    .map((c, i) => ({ ...c, rank: i + 1, moved: mode === 'total' ? c.lastRank - (i + 1) : 0 }));
}

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? null;

/** "Los Angeles, CA" or "Raleigh" → the board's id for it. */
export const cityIdOf = (location: string | null | undefined): string | null => {
  const name = (location ?? '').split(',')[0].trim().toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === name)?.id ?? null;
};

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};

/** How many cities logged anything this month (ranked or not): "3rd of 42". */
export const CITIES_ACTIVE = 42;

/** The month the board is for, and when it starts again. */
export const BOARD_MONTH = 'October';
export const RESETS_ON = 'November 1';

/**
 * This month's hits for the demo's own players (made up), for a city's
 * "Top players". Keyed by the demo user's id.
 */
export const DEMO_PLAYER_HITS: Record<string, number> = {
  'u-sam': 23, 'u-marcus': 21, 'u-noor': 19, 'u-theo': 17, 'u-lena': 16, 'u-omar': 14,
  'u-bea': 12, 'u-jonah': 11, 'u-ivy': 9, 'u-diego': 8, 'u-ella': 22,
  // Austin
  'u-mira': 26, 'u-leo': 24,
  // Others
  'u-dev': 18, 'u-june': 15, 'u-tomas': 13, 'u-nadia': 20,
};
/** You (the demo's Alex): 10 this month. */
export const MY_DEMO_HITS = 10;

/** Busiest courts this month, by sessions logged there (made up; only courts with 3+ different players count). */
export const DEMO_BUSY_COURTS: Record<string, { name: string; hits: number; courts: number; courtId?: string }[]> = {
  'los-angeles': [
    { name: 'Alder Park', hits: 64, courts: 4 },
    { name: 'Cypress Hollow Park', hits: 51, courts: 6 },
    { name: 'Juniper Community Park', hits: 29, courts: 3 },
  ],
  austin: [
    { name: 'Austin High Tennis Center', hits: 72, courts: 12 },
    { name: 'Pharr Tennis Center', hits: 58, courts: 8 },
    { name: 'Caswell Tennis Center', hits: 41, courts: 9 },
  ],
  raleigh: [
    { name: 'Millbrook Exchange Park', hits: 31, courts: 23 },
    { name: 'Pullen Park', hits: 22, courts: 4 },
    { name: 'Lions Park', hits: 14, courts: 5 },
  ],
};
