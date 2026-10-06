import type { HeadToHead, MatchSet, PracticeSession } from '@/data/types';

/*
 * A session's score (migration 91, Oct 4, for a match; migration 136,
 * Oct 6, for any tennis session): typed as one line ("6-4 3-6 10-7"), kept as sets
 * from the logger's side, and said back the same way everywhere (the log,
 * the card, the share picture, "Rematch?"). Plain functions, the same rules
 * as the server's match_sets_ok and sets_winner.
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

/** A set the server would take: two whole numbers 0–50, never level. */
const okSet = (x: unknown): x is MatchSet =>
  Array.isArray(x) && x.length === 2 && x.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_GAMES) && x[0] !== x[1];

/** Sets as they came from the server (or a saved copy): kept only when every one is good. */
export function validSets(x: unknown): MatchSet[] | undefined {
  if (!Array.isArray(x) || !x.length || x.length > MAX_SETS || !x.every(okSet)) return undefined;
  return x.map((s) => [s[0], s[1]] as MatchSet);
}

/**
 * What was typed in the Score box: nothing yet, a score, or why it isn't one.
 * Any dash or a colon between the games, spaces or commas between the sets;
 * a tiebreak's points in brackets ("7-6(5)") are left out.
 */
export function readScore(text: string): { sets?: MatchSet[]; problem?: string } {
  const clean = text.replace(/\(\s*\d{1,2}\s*\)/g, ' ').replace(/\s*[-–—:]\s*/g, '-').trim();
  if (!clean) return {};
  const parts = clean.split(/[\s,;/]+/).filter(Boolean);
  if (parts.length > MAX_SETS) return { problem: `At most ${MAX_SETS} sets.` };
  const sets: MatchSet[] = [];
  for (const part of parts) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(part);
    if (!m) return { problem: 'Type each set as games, like 6-4 3-6 10-7.' };
    const set: MatchSet = [Number(m[1]), Number(m[2])];
    if (set[0] > MAX_GAMES || set[1] > MAX_GAMES) return { problem: 'That set has too many games.' };
    if (set[0] === set[1]) return { problem: 'Each set needs a winner.' };
    sets.push(set);
  }
  return { sets };
}

/** Who took more sets: true (you), false (them), undefined (level, or no score). */
export function setsWinner(sets: MatchSet[] | undefined): boolean | undefined {
  if (!sets?.length) return undefined;
  const mine = sets.filter(([a, b]) => a > b).length;
  const theirs = sets.length - mine;
  return mine > theirs ? true : theirs > mine ? false : undefined;
}

/** The same score from the other side of the net. */
export const flipSets = (sets: MatchSet[]): MatchSet[] => sets.map(([a, b]) => [b, a] as MatchSet);

/** "6–4 3–6 10–7", with proper dashes; `plain` uses a hyphen, for a box you type in. */
export const scoreText = (sets: MatchSet[] | undefined, plain = false): string =>
  (sets ?? []).map(([a, b]) => `${a}${plain ? '-' : '–'}${b}`).join(' ');

/** For a screen reader, which reads "6–4" badly: "6 to 4, 3 to 6, 10 to 7". */
export const spokenScore = (sets: MatchSet[] | undefined): string => (sets ?? []).map(([a, b]) => `${a} to ${b}`).join(', ');

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
