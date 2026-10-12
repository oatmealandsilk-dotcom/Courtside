import type { HeadToHead, MatchSet, PracticeSession } from '@/data/types';

/*
 * A session's score (migration 91, Oct 4, for a match; migration 136,
 * Oct 6, for any tennis session): typed as one line ("6-4 3-6 10-7"), kept as sets
 * from the logger's side, and said back the same way everywhere (the log,
 * the card, the share picture, "Rematch?"). Plain functions, the same rules
 * as the server's match_sets_ok, set_tiebreaks_ok (migration 158) and
 * sets_winner.
 */

/**
 * Whether a session of this kind can carry a score (Oct 6, owner: "well
 * practices can have scores too"): any tennis session, a practice, a match
 * or drills. Never a workout (a run, the gym: kind 'fitness'). Only a match
 * has a result: on a practice or drills the sets are just the sets, never a
 * win or a loss, and they never count toward the win rate or a head-to-head.
 */
export const canScore = (kind: PracticeSession['kind'] | undefined): boolean => kind === 'practice' || kind === 'match' || kind === 'drills';

/*
 * Log entries whose score the server did not keep (a practice's or drills',
 * while migration 136 has not run yet): the "Logged" note says so, once,
 * instead of reading a score that is not there.
 */
const notKept = new Set<string>();
export const scoreNotKept = (sessionId: string): void => { notKept.add(sessionId); };
/** Whether this entry's score was not kept; true only the first time it is asked. */
export const tookScoreNotKept = (sessionId: string | undefined): boolean => !!sessionId && notKept.delete(sessionId);

/** Most sets a score can have, and most games in one (a long match tiebreak). */
export const MAX_SETS = 5;
const MAX_GAMES = 50;
/** Most points a tiebreak's loser can have, as the server allows (migration 158). */
const MAX_POINTS = 50;

/*
 * Tiebreak points (Oct 10, owner: "You should be able to use () in caption
 * for match score"): "7-6(5)" keeps the (5), the points the set's loser won
 * in its tiebreak, the way tennis writes it. From the other side of the net
 * the same set reads "6-7(5)": the loser's points are the same either way.
 * In the app a set carries them as a third number ([7, 6, 5]). The server
 * keeps its sets as two numbers each, which is all an older app can read,
 * and the points in a column of their own beside them (set_tiebreaks,
 * migration 158): withTiebreaks puts the two together, splitTiebreaks takes
 * them apart. Only a set whose games differ by one (7-6, 6-7, or 4-3 in a
 * short set) can have them, and they never change who won: games decide.
 */

/** Whether a set's games could have ended in a tiebreak: they differ by exactly one. */
const tiebreakGames = (a: number, b: number): boolean => Math.abs(a - b) === 1;
const okPoints = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_POINTS;
const okGames = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_GAMES;

/** A set the server would take (two whole numbers 0–50, never level), with this app's tiebreak points as an optional third. */
const okSet = (x: unknown): x is number[] =>
  Array.isArray(x) && (x.length === 2 || x.length === 3) && okGames(x[0]) && okGames(x[1]) && x[0] !== x[1];

/** One set, with its points only when they fit it. */
const setOf = (a: number, b: number, points?: unknown): MatchSet => (okPoints(points) && tiebreakGames(a, b) ? [a, b, points] : [a, b]);

/** Sets as they came from the server (or a saved copy): kept only when every one is good. Points that don't fit a set are left off it. */
export function validSets(x: unknown): MatchSet[] | undefined {
  if (!Array.isArray(x) || !x.length || x.length > MAX_SETS || !x.every(okSet)) return undefined;
  return x.map((s) => setOf(s[0], s[1], s[2]));
}

/**
 * The server's sets with their tiebreak points put back on (migration 158:
 * set_tiebreaks on a session or a tag, "tiebreaks" on a post's stats and on
 * a head-to-head's last match): one entry per set, a number or null. A list
 * of the wrong length, or points that don't fit their set, are left off and
 * the games still show. Before migration 158 runs there are none.
 */
export function withTiebreaks(sets: MatchSet[] | undefined, points: unknown): MatchSet[] | undefined {
  if (!sets || !Array.isArray(points) || points.length !== sets.length) return sets;
  return sets.map(([a, b], i) => setOf(a, b, points[i]));
}

/** The other way, for the server: the games alone, as every app reads them, and the points beside them (null when no set has any). */
export function splitTiebreaks(sets: MatchSet[]): { games: [number, number][]; points: (number | null)[] | null } {
  const points = sets.map((s) => s[2] ?? null);
  return { games: sets.map(([a, b]): [number, number] => [a, b]), points: points.some((p) => p !== null) ? points : null };
}

const TYPE_SETS = 'Type each set as games, like 6-4 3-6 10-7.';
const POINTS_AFTER = 'Tiebreak points go after a 7-6 set, like 7-6(5).';
const TOO_MANY_POINTS = 'That tiebreak has too many points.';
const gamesProblem = (a: number, b: number): string | undefined =>
  a > MAX_GAMES || b > MAX_GAMES ? 'That set has too many games.' : a === b ? 'Each set needs a winner.' : undefined;

/**
 * What was typed in the Score box: nothing yet, a score, or why it isn't one.
 * Any dash or a colon between the games, spaces or commas between the sets.
 * Brackets (Oct 10, owner):
 *   - one number after a set is its tiebreak's points: "7-6(5)", "6-7 (5)";
 *   - two numbers after a set whose games differ by one are its tiebreak's
 *     score, the loser's points the smaller: "7-6(7-5)", "7-6 (10-8)";
 *   - a match tiebreak played instead of a deciding set (owner: "Or if you
 *     play a tiebreaker in liu of 3rd set"): "6-4 3-6 (10-7)" or "[10-7]".
 *     It is kept as a set, [10, 7], exactly as "6-4 3-6 10-7" always was.
 * Square brackets are always a match tiebreak. Round ones around two
 * numbers are one when they come last, the sets before them are level (1-1
 * or 2-2) and the higher number is 10 or more, a match tiebreak's length:
 * "6-4 6-7 (10-7)" read as the second set's tiebreak would end the match at
 * one set all, which nobody logs, so it is the match tiebreak. Under 10,
 * straight after a set whose games differ by one, they are that set's
 * tiebreak ("6-4 6-7 (5-7)", "7-6 (7-5)"); a 7-point match tiebreak there is
 * typed in square brackets ("[7-5]"). Anywhere else a match tiebreak again. Nothing typed is silently left out:
 * points that fit no set say so.
 */
export function readScore(text: string): { sets?: MatchSet[]; problem?: string } {
  const clean = text.replace(/\s*[-–—:]\s*/g, '-').trim();
  if (!clean) return {};
  // What was typed, piece by piece: a set ("6-4"), or one or two numbers in brackets.
  const pieces: ({ games: [number, number] } | { square: boolean; nums: number[] })[] = [];
  const piece = /[\s,;/]+|(\d+)-(\d+)|([([])\s*(\d+)(?:-(\d+))?\s*([)\]])/y;
  while (piece.lastIndex < clean.length) {
    const m = piece.exec(clean);
    if (!m) return { problem: TYPE_SETS };
    if (m[1] !== undefined) pieces.push({ games: [Number(m[1]), Number(m[2])] });
    else if (m[3] !== undefined) {
      // "(5]" is not a bracket.
      if ((m[3] === '(') !== (m[6] === ')')) return { problem: TYPE_SETS };
      pieces.push({ square: m[3] === '[', nums: m[5] === undefined ? [Number(m[4])] : [Number(m[4]), Number(m[5])] });
    }
  }
  const sets: MatchSet[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if ('games' in p) {
      const problem = gamesProblem(p.games[0], p.games[1]);
      if (problem) return { problem };
      sets.push(p.games);
      continue;
    }
    // The set typed just before the brackets, when it could have had a tiebreak (and has no points yet).
    const before = pieces[i - 1];
    const last = sets[sets.length - 1];
    const prev = before && 'games' in before && tiebreakGames(last[0], last[1]) ? last : undefined;
    if (p.nums.length === 1) {
      if (p.square || !prev) return { problem: POINTS_AFTER };
      if (p.nums[0] > MAX_POINTS) return { problem: TOO_MANY_POINTS };
      sets[sets.length - 1] = [prev[0], prev[1], p.nums[0]];
      continue;
    }
    const [x, y] = p.nums;
    const mine = sets.filter(([a, b]) => a > b).length;
    const level = sets.length >= 2 && mine * 2 === sets.length;
    const decider = p.square || (i === pieces.length - 1 && level && Math.max(x, y) >= 10);
    if (!decider && prev) {
      if (x === y) return { problem: 'A tiebreak needs a winner, like 7-6(7-5).' };
      if (Math.min(x, y) > MAX_POINTS) return { problem: TOO_MANY_POINTS };
      sets[sets.length - 1] = [prev[0], prev[1], Math.min(x, y)];
      continue;
    }
    // A match tiebreak instead of a deciding set: a set of its own.
    const problem = gamesProblem(x, y);
    if (problem) return { problem };
    sets.push([x, y]);
  }
  if (sets.length > MAX_SETS) return { problem: `At most ${MAX_SETS} sets.` };
  return { sets };
}

/** Who took more sets: true (you), false (them), undefined (level, or no score). Tiebreak points never change it. */
export function setsWinner(sets: MatchSet[] | undefined): boolean | undefined {
  if (!sets?.length) return undefined;
  const mine = sets.filter(([a, b]) => a > b).length;
  const theirs = sets.length - mine;
  return mine > theirs ? true : theirs > mine ? false : undefined;
}

/** The same score from the other side of the net. A tiebreak's points stay as they are: they are the loser's either way. */
export const flipSets = (sets: MatchSet[]): MatchSet[] => sets.map(([a, b, points]) => setOf(b, a, points));

/**
 * Whether the set at `i` is a match tiebreak played instead of a deciding
 * set, to show in brackets: the last set, after the sets before it ended
 * level (1-1 or 2-2), with 10 or more on one side. Every 10-point match
 * tiebreak qualifies, however it ended (10-7, 10-8, 12-10). A deciding set
 * that long (a 10-8 final set) is far rarer in club tennis than a match
 * tiebreak, so it shows in brackets too, and readScore reads "(10-8)" back
 * as the same set. Read from the games alone: nothing more is saved for it,
 * so a 7-point match tiebreak (7-5) stays plain, the way a 7-5 final set is.
 */
const matchTiebreakAt = (sets: MatchSet[], i: number): boolean => {
  const [a, b, points] = sets[i];
  if (i !== sets.length - 1 || i < 2 || points !== undefined) return false;
  if (sets.slice(0, i).filter(([x, y]) => x > y).length * 2 !== i) return false;
  return Math.max(a, b) >= 10;
};

/**
 * "7–6(5) 3–6 (10–7)", with proper dashes: a tiebreak's points after its
 * set, a match tiebreak in brackets. `plain` uses a hyphen, for a box you
 * type in, and readScore reads it back as the same score.
 */
export const scoreText = (sets: MatchSet[] | undefined, plain = false): string =>
  (sets ?? []).map(([a, b, points], i, all) => {
    const games = `${a}${plain ? '-' : '–'}${b}`;
    return points !== undefined ? `${games}(${points})` : matchTiebreakAt(all, i) ? `(${games})` : games;
  }).join(' ');

/** For a screen reader, which reads "6–4" badly: "7 to 6, tiebreak 5, 3 to 6, match tiebreak 10 to 7". */
export const spokenScore = (sets: MatchSet[] | undefined): string =>
  (sets ?? []).map(([a, b, points], i, all) => (points !== undefined ? `${a} to ${b}, tiebreak ${points}` : `${matchTiebreakAt(all, i) ? 'match tiebreak ' : ''}${a} to ${b}`)).join(', ');

/**
 * How much a score drawn big on one line (a card, a share picture) shrinks
 * so a long one (tiebreak points on three sets, or five sets) fits instead
 * of ending in "…": full size up to `fits` characters, smaller past that,
 * never under two thirds. A score that fitted before keeps its size.
 */
export const scoreScale = (score: string, fits: number): number => Math.max(2 / 3, Math.min(1, fits / Math.max(1, score.length)));

/** The note a rematch starts with: "Rematch? Last time 6–4 3–6 10–7", or just "Rematch?" with no score. */
export const rematchNote = (sets: MatchSet[] | undefined): string => (sets?.length ? `Rematch? Last time ${scoreText(sets)}` : 'Rematch?');

/**
 * A head-to-head in words, from your side: "You lead 3–2", "Sam leads 3–2",
 * "All square 2–2". Null when you have no scored matches together.
 */
export function recordLine(h: Pick<HeadToHead, 'wins' | 'losses'> | null | undefined, theirName: string): string | null {
  if (!h || h.wins + h.losses === 0) return null;
  if (h.wins > h.losses) return `You lead ${h.wins}–${h.losses}`;
  if (h.losses > h.wins) return `${theirName} leads ${h.losses}–${h.wins}`;
  return `All square ${h.wins}–${h.losses}`;
}
