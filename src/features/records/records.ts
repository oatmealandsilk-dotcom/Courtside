import type { ID, PersonalRecord, Post, PracticeSession, RecordKey, Records, Story } from '@/data/types';
import { scoreText } from '@/features/activity/score';
import { activeDays, localDay } from '@/features/practice/stats';
import { duration } from '@/lib/format';

/*
 * Personal records (owner, Oct 5: "personal records is good"), the way
 * Strava keeps them: worked out on the phone from your own log (the last 400
 * days the app holds), private to you unless you share. Tennis only
 * (practice, matches and drills, never the gym), except the streak, which is
 * the streak the profile already shows (sessions, posts and Instants).
 *
 *   Best week        most time on court, Monday to Sunday, at least an hour
 *   Longest streak   days in a row, at least 3
 *   Busiest month    most sessions in a month, at least 3
 *   Biggest win      a won match with a score: your games minus theirs
 *   Longest match    a match of at least 30 minutes
 *
 * A record is only beaten by going strictly higher: a tie leaves it with the
 * first one to reach it. A first-ever number is a record but never a
 * celebration: only beating a number you already had is (beaten()).
 */

/** The least each record needs before it counts. */
export const RECORD_MIN: Record<RecordKey, number> = { week: 60, streak: 3, month: 3, win: 1, match: 30 };

/** The order the records are shown in. */
export const RECORD_KEYS: RecordKey[] = ['match', 'win', 'week', 'month', 'streak'];

/** Short enough for one line on a record's tile and in the "New record!" note. */
export const RECORD_LABEL: Record<RecordKey, string> = {
  week: 'Best week',
  streak: 'Longest streak',
  month: 'Busiest month',
  win: 'Biggest win',
  match: 'Longest match',
};

const isTennis = (s: PracticeSession) => s.kind !== 'fitness';
const chronological = (a: PracticeSession, b: PracticeSession) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt.localeCompare(b.createdAt));
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d); };

/** The Monday a day's week starts on ("2026-09-28"). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

/** A won match's margin: your games minus theirs. Undefined without a score. */
export function winMargin(s: Pick<PracticeSession, 'kind' | 'won' | 'sets'>): number | undefined {
  if (s.kind !== 'match' || s.won !== true || !s.sets?.length) return undefined;
  return s.sets.reduce((sum, [a, b]) => sum + a - b, 0);
}

/** Every run of days in a row, oldest first: [first day, last day, length]. */
export function streakRuns(days: Set<string>): { from: string; to: string; length: number }[] {
  const runs: { from: string; to: string; length: number }[] = [];
  for (const day of [...days].sort()) {
    if (days.has(addDays(day, -1))) continue;
    let to = day;
    let length = 1;
    while (days.has(addDays(to, 1))) { to = addDays(to, 1); length += 1; }
    runs.push({ from: day, to, length });
  }
  return runs;
}

/** Your records, from your own log (and, for the streak, your posts and Instants). */
export function computeRecords(me: ID, sessions: PracticeSession[], posts: Post[] = [], stories: Story[] = []): Records {
  const mine = sessions.filter((s) => s.userId === me).sort(chronological);
  const tennis = mine.filter(isTennis);
  const out: Records = {};
  // The first to reach the highest value holds it: walk oldest first, take only strictly higher.
  const keep = (key: RecordKey, value: number, rest: Omit<PersonalRecord, 'key' | 'value'>) => {
    if (value < RECORD_MIN[key]) return;
    const had = out[key];
    if (!had || value > had.value) out[key] = { key, value, ...rest };
  };

  const weeks = new Map<string, number>();
  const months = new Map<string, number>();
  for (const s of tennis) {
    const w = weekStart(s.day);
    weeks.set(w, (weeks.get(w) ?? 0) + s.minutes);
    const m = s.day.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  for (const [w, minutes] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) keep('week', minutes, { from: w, to: addDays(w, 6) });
  for (const [m, n] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    const first = `${m}-01`;
    const last = localDay(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0, 12));
    keep('month', n, { from: first, to: last });
  }
  for (const s of tennis) {
    const margin = winMargin(s);
    if (margin !== undefined) keep('win', margin, { sessionId: s.id, from: s.day, to: s.day });
    if (s.kind === 'match') keep('match', s.minutes, { sessionId: s.id, from: s.day, to: s.day });
  }
  for (const run of streakRuns(activeDays(me, sessions, posts, stories))) keep('streak', run.length, { from: run.from, to: run.to });
  return out;
}

/** What holds a record, so a record taken again by the same thing (a week that grows) is not a new one. */
const holder = (r: PersonalRecord) => r.sessionId ?? r.from;

export interface RecordBeat { key: RecordKey; now: PersonalRecord; was: PersonalRecord }

/**
 * The records a change beat: there before, strictly higher after, and held
 * by something new (a week or a streak growing further after it already
 * broke the record is not celebrated again). A first-ever record never is.
 */
export function beaten(before: Records, after: Records): RecordBeat[] {
  const out: RecordBeat[] = [];
  for (const key of RECORD_KEYS) {
    const was = before[key];
    const now = after[key];
    if (!was || !now || now.value <= was.value || holder(now) === holder(was)) continue;
    out.push({ key, now, was });
  }
  return out;
}

/** The records one new session beats, given your log before it. */
export function beatenBy(me: ID, before: PracticeSession[], added: PracticeSession, posts: Post[] = [], stories: Story[] = []): RecordBeat[] {
  return beaten(computeRecords(me, before, posts, stories), computeRecords(me, [added, ...before.filter((s) => s.id !== added.id)], posts, stories));
}

/** The sessions that hold a record now (the gold "Record" pill in Your sessions). */
export function recordSessionIds(records: Records): Set<ID> {
  return new Set(RECORD_KEYS.map((k) => records[k]?.sessionId).filter((id): id is ID => !!id));
}

/** A record's number as the app says it: "2h 40m", "9 days", "14", "+11 games". */
export function recordValue(r: Pick<PersonalRecord, 'key' | 'value'>): string {
  switch (r.key) {
    case 'week': case 'match': return duration(r.value);
    case 'streak': return `${r.value} ${r.value === 1 ? 'day' : 'days'}`;
    case 'month': return `${r.value} ${r.value === 1 ? 'session' : 'sessions'}`;
    case 'win': return `+${r.value} ${r.value === 1 ? 'game' : 'games'}`;
    default: return String(r.value);
  }
}

/** "Longest match and biggest win", "Longest match, biggest win and longest streak". */
function namesOf(keys: RecordKey[]): string {
  const words = keys.map((k, i) => (i === 0 ? RECORD_LABEL[k] : RECORD_LABEL[k].charAt(0).toLowerCase() + RECORD_LABEL[k].slice(1)));
  return words.length <= 1 ? words[0] ?? '' : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The words of the "New record!" moment, short enough for the note's one
 * title line: "New record! Longest match" over "2h 40m · beat 2h 5m", or
 * "New record! Biggest win" over "6–0 6–1 · +11 games (was +5)". Two or
 * more at once: "2 new records!" over "Longest match and biggest win".
 */
export function recordToast(beats: RecordBeat[], sessions: PracticeSession[] = []): { title: string; body: string } | null {
  if (!beats.length) return null;
  if (beats.length > 1) return { title: `${beats.length} new records!`, body: namesOf(beats.map((b) => b.key)) };
  const first = beats[0];
  const title = `New record! ${RECORD_LABEL[first.key]}`;
  const score = first.key === 'win' ? scoreText(sessions.find((s) => s.id === first.now.sessionId)?.sets) : '';
  const body = first.key === 'win'
    ? `${score ? `${score} · ` : ''}${recordValue(first.now)} (was +${first.was.value})`
    : `${recordValue(first.now)} · beat ${recordValue(first.was)}`;
  return { title, body };
}
