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

/**
 * Round 3 (Oct 28): how many players the picture shows as up to hit today
 * ('0', '1'), so the fill behind them can be photographed; unset, everyone
 * the demo has up.
 *
 *   localStorage['courtside-cityboard-up'] = '1'
 */
export const MOCK_UP_COUNT: number | null = (() => {
  const v = read('courtside-cityboard-up');
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
})();

/**
 * How 1st to 3rd wear their metal: 'coin' (the numeral on a small coin of
 * its metal, the default) or 'ink' (the big numeral in the metal, no coin),
 * for a side-by-side picture.
 *
 *   localStorage['courtside-cityboard-medal'] = 'ink'
 */
export const MEDAL_LOOK: 'coin' | 'ink' = read('courtside-cityboard-medal') === 'ink' ? 'ink' : 'coin';

/**
 * Round 4 (Oct 28). Owner: "something on the leaderboard that make sit more
 * obvious the numbers on the right is sessions. Maybe an icon or smth". How
 * the number on the right of every board row (Find Players, the full board,
 * a city's Top players and Busiest courts) says what it counts:
 *
 *   'a'  the app's session ball (Ionicons tennisball) right after each number
 *   'b'  the word under each number: "512" over "sessions" (the default)
 *   'c'  the ball and the word once, over the number column; numbers bare
 *
 *   localStorage['courtside-cityboard-unit'] = 'a'
 */
export type UnitLook = 'a' | 'b' | 'c';
export const UNIT_LOOK: UnitLook = (() => {
  const v = read('courtside-cityboard-unit');
  return v === 'a' || v === 'b' || v === 'c' ? v : 'b';
})();

/** "512 sessions", "1 session": what VoiceOver hears for a board's number. */
export const sessionsWords = (n: number | string) => `${n} ${Number(n) === 1 ? 'session' : 'sessions'}`;

export interface BoardCity {
  id: string;
  name: string;
  state: string;
  /** Tennis sessions logged this month by players whose home city this is. */
  hits: number;
  /** Players who logged at least one this month. */
  players: number;
  /** Where it stood on the board a week ago (for "▲2" beside it): the race this week, not last month's. */
  weekAgoRank: number;
  /** Weeks in a row it has climbed, this one included ("climbing 3 weeks running" beside a city on a run, from 2). */
  run?: number;
}

/** October's board, made up. A young app's numbers: hundreds, not thousands. */
const CITIES: BoardCity[] = [
  { id: 'new-york', name: 'New York', state: 'NY', hits: 512, players: 88, weekAgoRank: 1 },
  { id: 'austin', name: 'Austin', state: 'TX', hits: 473, players: 54, weekAgoRank: 3, run: 1 },
  { id: 'los-angeles', name: 'Los Angeles', state: 'CA', hits: 412, players: 71, weekAgoRank: 2 },
  { id: 'chicago', name: 'Chicago', state: 'IL', hits: 288, players: 47, weekAgoRank: 7, run: 2 },
  { id: 'miami', name: 'Miami', state: 'FL', hits: 241, players: 35, weekAgoRank: 6, run: 1 },
  { id: 'seattle', name: 'Seattle', state: 'WA', hits: 197, players: 33, weekAgoRank: 4 },
  { id: 'denver', name: 'Denver', state: 'CO', hits: 164, players: 21, weekAgoRank: 5 },
  { id: 'raleigh', name: 'Raleigh', state: 'NC', hits: 96, players: 9, weekAgoRank: 11, run: 3 },
  { id: 'atlanta', name: 'Atlanta', state: 'GA', hits: 88, players: 15, weekAgoRank: 8 },
  { id: 'san-diego', name: 'San Diego', state: 'CA', hits: 71, players: 13, weekAgoRank: 9 },
  { id: 'boston', name: 'Boston', state: 'MA', hits: 64, players: 12, weekAgoRank: 10 },
  { id: 'houston', name: 'Houston', state: 'TX', hits: 52, players: 10, weekAgoRank: 12 },
  { id: 'phoenix', name: 'Phoenix', state: 'AZ', hits: 41, players: 8, weekAgoRank: 14, run: 1 },
  { id: 'nashville', name: 'Nashville', state: 'TN', hits: 37, players: 6, weekAgoRank: 13 },
  { id: 'portland', name: 'Portland', state: 'OR', hits: 33, players: 7, weekAgoRank: 15 },
  // Too few players to rank yet: shown only as "needs 2 more players".
  { id: 'cary', name: 'Cary', state: 'NC', hits: 14, players: 3, weekAgoRank: 0 },
];

/** Cities with fewer players than this are not ranked (a city of two would show two people's logs). */
export const MIN_PLAYERS = 5;

export type BoardMode = 'total' | 'per';

/** `moved`: places gained (+) or lost (-) since a week ago, on the hits board; 0 on the per-player one. */
export interface RankedCity extends BoardCity { rank: number; value: number; moved: number }

/**
 * On a run: up 3 places or more this week. The one loud mark on the board
 * (a filled "▲3"), so it means something when it shows: most weeks, one or
 * two cities have it, never half the table.
 */
export const isHot = (c: Pick<RankedCity, 'moved'>) => c.moved >= 3;

const perPlayer = (c: BoardCity) => Math.round((c.hits / c.players) * 10) / 10;

/**
 * The month's board, best first: by hits, or by hits per player. Level
 * cities share a place (two on 5.8 are both 9th, as "level with" says);
 * the next one down skips a place, as on any sports table.
 */
export function rankCities(mode: BoardMode): RankedCity[] {
  const value = (c: BoardCity) => (mode === 'per' ? perPlayer(c) : c.hits);
  const sorted = CITIES.filter((c) => c.players >= MIN_PLAYERS)
    .map((c) => ({ ...c, value: value(c) }))
    .sort((a, b) => b.value - a.value || b.hits - a.hits);
  const out: RankedCity[] = [];
  sorted.forEach((c, i) => {
    const rank = i > 0 && sorted[i - 1].value === c.value ? out[i - 1].rank : i + 1;
    out.push({ ...c, rank, moved: mode === 'total' && c.weekAgoRank ? c.weekAgoRank - rank : 0 });
  });
  return out;
}

/** The cities either side of one on a board (by position, so a shared place still finds its neighbours). */
export function neighbours(board: RankedCity[], id: string): { above: RankedCity | null; below: RankedCity | null } {
  const i = board.findIndex((c) => c.id === id);
  return i < 0 ? { above: null, below: null } : { above: board[i - 1] ?? null, below: board[i + 1] ?? null };
}

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? null;

/**
 * The next city to catch, and by how many: "61 to pass Austin". By position
 * (a city level with the one above it still has to pass it: 1 more). Null
 * for the leader.
 */
export function nextTarget(board: RankedCity[], id: string): { city: RankedCity; gap: number; per: boolean } | null {
  const i = board.findIndex((c) => c.id === id);
  if (i <= 0) return null;
  const above = board[i - 1];
  const me = board[i];
  const per = me.value !== me.hits;
  const raw = above.value - me.value;
  // Hits: one more than the gap passes them; per player, the gap itself (rounded up to a tenth).
  const gap = per ? Math.max(0.1, Math.ceil(raw * 10) / 10) : raw + 1;
  return { city: above, gap, per };
}

/** The week's moments on the board, newest first (made up): "Raleigh passed Atlanta · today". */
export const MOMENTS: { who: string; passed: string; when: string }[] = [
  { who: 'raleigh', passed: 'atlanta', when: 'today' },
  { who: 'austin', passed: 'los-angeles', when: 'yesterday' },
  { who: 'chicago', passed: 'seattle', when: 'Sunday' },
];

/**
 * The month's most watched clip from each city, for the top of its page
 * (made up). Only a public clip by an adult is ever picked: never a teen's,
 * whoever is looking, nor a private account's. `media` names the
 * picture-only video the photographing script serves beside the build
 * (cityboard-reel-a.mp4); without it the hero is the demo's court card.
 */
export const TOP_REEL: Record<string, { postId: string; authorId: string; views: number; media: 'a' | 'b' | 'c' }> = {
  'los-angeles': { postId: 'p-sam-clip', authorId: 'u-sam', views: 2431, media: 'a' },
  austin: { postId: 'p1', authorId: 'u-mira', views: 1874, media: 'b' },
};

/** Where the picture-only clips are served from (the photographing script sets it); null in every real build. */
export const REEL_MEDIA_BASE: string | null = read('courtside-cityboard-media');

/** "2.4k views", "612 views". */
export const viewsWords = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString()}k views` : `${n} views`);

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
 * The quiet word beside "Cities this month" on Find Players: how long the
 * race has left ("5 days left", "Last day"), which says the board is live
 * and gives a reason to log today. "October" alone repeated "this month".
 */
export const DAYS_LEFT_LABEL: string = (() => {
  const now = new Date();
  // The mock's month is October 2026; on any other day the picture falls back to the month's name.
  if (now.getFullYear() !== 2026 || now.getMonth() !== 9) return BOARD_MONTH;
  const left = 31 - now.getDate() + 1;
  return left <= 1 ? 'Last day' : `${left} days left`;
})();

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

// ---- Round 3 (Oct 28): Up to hit today never looks empty ----

/**
 * Faces in the Up to hit row before the fill stops: players up today first
 * (green ring), then the city's most active players to this many (owner,
 * Oct 28: "fill the rest with more circles without the ring"). With 5 up,
 * 3 more; with 1 up, 7; with nobody up, 8.
 */
export const FILL_TO = 8;

/**
 * A player's latest logged sessions (made up), newest first, each as when
 * it started: [weekday (0 Sunday … 6 Saturday), hour (0-23)]; and how many
 * days ago the newest was. Only what the session log already holds: no
 * place, no court, no live location.
 */
export interface PlayLog { sessions: [number, number][]; lastDaysAgo: number }

export const DEMO_PLAY_LOG: Record<string, PlayLog> = {
  // Los Angeles
  'u-sam': { sessions: [[6, 9], [0, 10], [3, 18], [6, 8], [0, 9], [6, 16], [2, 19], [0, 11], [6, 9], [0, 15]], lastDaysAgo: 2 },
  'u-marcus': { sessions: [[1, 19], [2, 18], [3, 19], [4, 20], [1, 18], [3, 18], [6, 10], [2, 19], [4, 18], [0, 9]], lastDaysAgo: 1 },
  'u-noor': { sessions: [[6, 9], [0, 10], [6, 8], [0, 9], [6, 16], [3, 18], [0, 11], [6, 9], [0, 8], [5, 19]], lastDaysAgo: 2 },
  'u-theo': { sessions: [[1, 7], [2, 6], [3, 7], [5, 7], [1, 6], [4, 7], [2, 7], [6, 8], [3, 6], [5, 18]], lastDaysAgo: 0 },
  'u-lena': { sessions: [[2, 12], [6, 15], [4, 19], [0, 9], [3, 13], [1, 18], [5, 10], [6, 17]], lastDaysAgo: 1 },
  'u-omar': { sessions: [[2, 19], [4, 18], [1, 20], [3, 19], [2, 18], [5, 17], [4, 19], [0, 16]], lastDaysAgo: 3 },
  'u-bea': { sessions: [[6, 10], [0, 15], [6, 9], [0, 16], [6, 11], [3, 19]], lastDaysAgo: 2 },
  'u-jonah': { sessions: [[2, 12], [5, 18], [6, 10], [3, 13], [1, 7]], lastDaysAgo: 3 },
  'u-ivy': { sessions: [[4, 18], [6, 10], [2, 7]], lastDaysAgo: 5 },
  'u-diego': { sessions: [[1, 19], [3, 20], [4, 18], [2, 19], [0, 10]], lastDaysAgo: 1 },
  // Austin (the made-up players on its page)
  'mock-hannah-wright': { sessions: [[6, 8], [0, 9], [6, 9], [0, 8], [6, 10], [2, 18]], lastDaysAgo: 2 },
  'mock-grace-liu': { sessions: [[1, 6], [3, 7], [5, 6], [2, 7], [4, 6]], lastDaysAgo: 1 },
};

/** The habit needs this many sessions to go on, and this share of them to say "usually". */
const HABIT_MIN = 4;
const HABIT_SHARE = 0.6;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What a filled face says: its two short lines, and the same said in full for VoiceOver. */
export interface PlayLine { lines: [string, string]; spoken: string }

/**
 * The quiet words under a filled face: when this player usually plays, read
 * from their own last sessions, so they say something true and useful to
 * someone looking for a hit ("Usually evenings": ask them after work). Two
 * short lines, the way a ringed face has two ("1.1 mi", "till 8pm"), so
 * every face in the row breaks the same way: ['Usually', 'evenings'].
 *
 *   - 6 of their last 10 (at least 4 logged) on a Saturday or Sunday: "Usually weekends";
 *     starting 5pm or later: "Usually evenings"; before 11am: "Usually mornings".
 *     Two at once: the stronger one.
 *   - No clear habit: when they last played ("Played yesterday", "Played Saturday"),
 *     never a time or a place.
 *   - Nothing logged in a week: their sessions this month.
 *
 * "Usually", the owner's own word (Oct 28: "it says like usually active under
 * their name"), and never a bare "Plays evenings": under "Up to hit today"
 * that could read as "playing this evening". A filled face is a regular, not
 * someone up today; only the green ring says that.
 */
export function playLine(log: PlayLog | undefined, hits: number, now: Date = new Date()): PlayLine {
  const last10 = log?.sessions.slice(0, 10) ?? [];
  if (last10.length >= HABIT_MIN) {
    const share = (test: (s: [number, number]) => boolean) => last10.filter(test).length / last10.length;
    const habits: [string, number][] = [
      ['weekends', share(([d]) => d === 0 || d === 6)],
      ['evenings', share(([, h]) => h >= 17)],
      ['mornings', share(([, h]) => h < 11)],
    ];
    const best = habits.filter(([, s]) => s >= HABIT_SHARE).sort((a, b) => b[1] - a[1])[0];
    if (best) return { lines: ['Usually', best[0]], spoken: `usually plays ${best[0]}` };
  }
  const day = !log ? null : log.lastDaysAgo === 0 ? 'today' : log.lastDaysAgo === 1 ? 'yesterday' : log.lastDaysAgo < 7 ? WEEKDAYS[(now.getDay() - log.lastDaysAgo + 7) % 7] : null;
  if (day) return { lines: ['Played', day], spoken: `played ${day === 'today' || day === 'yesterday' ? day : `on ${day}`}` };
  return { lines: [sessionsWords(hits), 'this month'], spoken: `${sessionsWords(hits)} this month` };
}
