import type { CityBoard, CityBoardCity, CityPageFill, ID, PracticeSession } from '@/data/types';
import { localDay } from '@/features/practice/stats';

/**
 * City boards (migration 196; owner, Oct 28: "New rank city sessions is
 * good"): the pure rules the screens share. The numbers come from the
 * server (city_board(), city_page()), or in the demo from api.ts, in the
 * same shapes; nothing here is made up.
 *
 * Every number but your own is as of yesterday. Your own sessions are up to
 * the minute (`me.sessions`), and the phone adds what your city's total does
 * not hold yet (`me.inTotal`) to your own city only, so logging a session
 * and opening the board shows it at once.
 */

/** Cities with fewer players than this are not ranked (city_board_rules().min_players; decision 6). */
export const MIN_PLAYERS = 5;

/**
 * Faces in the Up to hit row before the fill stops (city_board_rules().fill_to):
 * players up today first (green ring), then the city's most active players
 * (owner, Oct 28: "fill the rest with more circles without the ring").
 */
export const FILL_TO = 8;

export type BoardMode = 'total' | 'per';

/** A ranked row as a screen draws it: its place on this tab, the number it is ranked by, and its move this week. */
export interface RankedCity extends CityBoardCity {
  /** Sessions, or sessions per player on the Per player tab. */
  value: number;
  /** Places gained (+) or lost (-) since a week ago, on the Sessions tab; 0 on Per player. */
  moved: number;
}

/**
 * On a run: up 3 places or more this week. The one loud mark on the board
 * (a filled "▲3"), so it means something when it shows.
 */
export const isHot = (c: Pick<RankedCity, 'moved'>) => c.moved >= 3;

/** "512 sessions", "1 session": what VoiceOver hears for a board's number. */
export const sessionsWords = (n: number | string) => `${n} ${Number(n) === 1 ? 'session' : 'sessions'}`;

/** "2 more players", "1 more player". */
export const morePlayersWords = (n: number) => `${n} more ${n === 1 ? 'player' : 'players'}`;

/** "2.4k views", "612 views". */
export const viewsWords = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString()}k views` : `${n} ${n === 1 ? 'view' : 'views'}`);

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};

const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * The board, best first: by sessions, or by sessions per player. Level
 * cities share a place (two on 5.8 are both 9th, as "level with" says); the
 * next one down skips a place, as on any sports table. Ties are listed by
 * players, then name, as the server lists them.
 */
export function rankCities(cities: CityBoardCity[], mode: BoardMode): RankedCity[] {
  const value = (c: CityBoardCity) => (mode === 'per' ? c.perValue : c.sessions);
  const sorted = [...cities].sort((a, b) => value(b) - value(a) || b.players - a.players || a.name.localeCompare(b.name));
  const out: RankedCity[] = [];
  sorted.forEach((c, i) => {
    const rank = i > 0 && value(sorted[i - 1]) === value(c) ? out[i - 1].rank : i + 1;
    out.push({ ...c, rank, value: value(c), moved: mode === 'total' && c.weekAgoRank ? c.weekAgoRank - rank : 0 });
  });
  return out;
}

/**
 * The next city to catch, and by how many: "62 to pass Austin". By position
 * (a city level with the one above it still has to pass it: 1 more). Null
 * for the leader. Per player: the difference to a tenth (at least 0.1).
 */
export function nextTarget(board: RankedCity[], id: string, mode: BoardMode): { city: RankedCity; gap: number; per: boolean } | null {
  const i = board.findIndex((c) => c.id === id);
  if (i <= 0) return null;
  const above = board[i - 1];
  const raw = above.value - board[i].value;
  const per = mode === 'per';
  return { city: above, gap: per ? Math.max(0.1, tenth(raw)) : raw + 1, per };
}

/**
 * Your own city's row with your own sessions in it: the server's total is
 * as of yesterday (it holds `me.inTotal` of yours); the rest of yours
 * (today's, and any logged since the last refresh: `extra`) is added here,
 * to your own city only, and only while your month counts for it.
 */
export function withMine(board: CityBoard, extra = 0): { cities: CityBoardCity[]; mySessions: number; countsHere: boolean } {
  const me = board.me;
  const mySessions = me.sessions + extra;
  // Your month counts where its first session was: here, or (nothing counted yet) here from your next one.
  // Counted with no town on your profile then (countsFor null, sessions > 0): nowhere this month.
  const countsHere = !!me.cityId && (me.countsFor === me.cityId || (me.countsFor === null && me.sessions === 0));
  const add = countsHere ? mySessions - me.inTotal : 0;
  if (add <= 0) return { cities: board.cities, mySessions, countsHere };
  const cities = board.cities.map((c) => {
    if (c.id !== me.cityId) return c;
    const sessions = c.sessions + add;
    const players = c.players + (me.inTotal === 0 ? 1 : 0);
    return { ...c, sessions, players, perValue: tenth(sessions / players) };
  });
  return { cities, mySessions, countsHere };
}

const TENNIS = new Set<PracticeSession['kind']>(['practice', 'match', 'drills']);
const DAY_MS = 86_400_000;

/**
 * Your sessions this phone logged since the board was last worked out that
 * the server will count (refresh_city_board, step 1): tennis, in the board's
 * month, logged within 7 days of the day played and not for a later day, at
 * most 2 a day (with the ones it already counted that day).
 */
export function sessionsSince(sessions: PracticeSession[], me: ID, month: string, refreshedAt: string | null): number {
  if (!refreshedAt) return 0;
  const since = Date.parse(refreshedAt);
  const end = monthAfter(month);
  const byDay = new Map<string, { before: number; after: number }>();
  for (const s of sessions) {
    if (s.userId !== me || !TENNIS.has(s.kind) || s.day < month || s.day >= end) continue;
    const at = Date.parse(s.createdAt);
    // The server's own two limits, in its own clock (UTC): logged before the 8th day after, and not for a later day than tomorrow.
    if (!Number.isFinite(at) || at >= Date.parse(`${s.day}T00:00:00Z`) + 8 * DAY_MS || s.day > new Date(at + DAY_MS).toISOString().slice(0, 10)) continue;
    const d = byDay.get(s.day) ?? { before: 0, after: 0 };
    if (at > since) d.after += 1; else d.before += 1;
    byDay.set(s.day, d);
  }
  let n = 0;
  for (const d of byDay.values()) n += Math.min(d.after, Math.max(0, 2 - d.before));
  return n;
}

/** Places shared on equal sessions, as a standings table: [12, 9, 9, 7] are 1st, 2nd, 2nd, 4th. */
export function rankRows<T extends { sessions: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.sessions - a.sessions);
  const out: (T & { rank: number })[] = [];
  sorted.forEach((r, i) => out.push({ ...r, rank: i > 0 && sorted[i - 1].sessions === r.sessions ? out[i - 1].rank : i + 1 }));
  return out;
}

/* ---- The month ---- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const firstOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;

/** This phone's own month, 'YYYY-MM-01'. */
export const thisMonth = (now: Date = new Date()) => firstOf(now.getFullYear(), now.getMonth());

/** The month after one ('2026-10-01' → '2026-11-01'). */
export function monthAfter(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? firstOf(y + 1, 0) : firstOf(y, m);
}

/**
 * The month the board shows: the phone's own, except on the 1st, when the
 * new month has nothing counted yet: then last month's final board (the
 * server keeps it open until the 3rd).
 */
export function boardMonth(now: Date = new Date()): string {
  if (now.getDate() !== 1) return thisMonth(now);
  return now.getMonth() === 0 ? firstOf(now.getFullYear() - 1, 11) : firstOf(now.getFullYear(), now.getMonth() - 1);
}

/** "October". */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? '';

/** Whether a month's board is over (shown on the 1st as the final board). */
export const isFinal = (month: string, now: Date = new Date()) => month < thisMonth(now);

/**
 * The quiet word beside "Cities this month": how long the race has left
 * ("5 days left", "Last day"), which says the board is live and gives a
 * reason to log today; "Final" for last month's, shown on the 1st.
 */
export function daysLeftLabel(month: string, now: Date = new Date()): string {
  if (isFinal(month, now)) return 'Final';
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const left = days - now.getDate() + 1;
  return left <= 1 ? 'Last day' : `${left} days left`;
}

/** "November 1": when a month's board starts again. */
export const resetsOn = (month: string) => `${monthName(monthAfter(month))} 1`;

/** Calendar days from a local day ('YYYY-MM-DD') to today on this phone. */
function daysBack(day: string, now: Date): number {
  const [y, m, d] = day.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - then) / DAY_MS);
}

/** When a news line happened, in the phone's own words: "today", "yesterday", "Sunday" (within 6 days), else null. */
export function whenWords(at: string, now: Date = new Date()): string | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const back = daysBack(localDay(t), now);
  if (back < 0) return null;
  if (back === 0) return 'today';
  if (back === 1) return 'yesterday';
  return back <= 6 ? WEEKDAYS[new Date(t).getDay()] : null;
}

/* ---- The words under a filled face ---- */

/** What a filled face says: its two short lines, and the same said in full for VoiceOver. */
export interface PlayLine { lines: [string, string]; spoken: string }

/**
 * The quiet words under a filled face, from what the server worked out of
 * the player's own sessions (refresh_city_board, step 2). Two short lines,
 * the way a ringed face has two ("1.1 mi", "till 8pm"):
 *
 *   - "Usually weekends / evenings / mornings" (6 of their last 10, at least 4);
 *   - else when they last played: "Played yesterday", "Played Saturday"
 *     (never today, never more than 6 days back);
 *   - else their sessions this month, only when they are on Top players too;
 *   - else "Active this month": nobody outside Top players carries a number.
 *
 * "Usually" is the owner's own word (Oct 28), and never a bare "Plays
 * evenings": under "Up to hit today" that could read as "playing this
 * evening". A filled face is a regular; only the green ring says "up today".
 */
export function playWords(f: Pick<CityPageFill, 'habit' | 'lastDay' | 'sessions'>, now: Date = new Date()): PlayLine {
  if (f.habit) return { lines: ['Usually', f.habit], spoken: `usually plays ${f.habit}` };
  if (f.lastDay && /^\d{4}-\d{2}-\d{2}$/.test(f.lastDay)) {
    const back = daysBack(f.lastDay, now);
    if (back >= 1 && back <= 6) {
      const [y, m, d] = f.lastDay.split('-').map(Number);
      const day = back === 1 ? 'yesterday' : WEEKDAYS[new Date(y, m - 1, d).getDay()];
      return { lines: ['Played', day], spoken: `played ${back === 1 ? day : `on ${day}`}` };
    }
  }
  if (typeof f.sessions === 'number' && f.sessions > 0) return { lines: [sessionsWords(f.sessions), 'this month'], spoken: `${sessionsWords(f.sessions)} this month` };
  return { lines: ['Active', 'this month'], spoken: 'active this month' };
}
