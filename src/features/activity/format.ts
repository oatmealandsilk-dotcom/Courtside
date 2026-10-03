import type { DetectedActivity, HealthShareKey, ID, PracticeSession, SessionDetail, SessionWith, StatsSource } from '@/data/types';
import { localDay } from '@/features/practice/stats';
import { sessionPeople } from './sessionTags';
import { withShare } from './healthShare';
import { duration } from '@/lib/format';

/*
 * How a tracker's tennis session is put into words: its name, its day, its
 * times, where it came from, and the private line of numbers only its owner
 * sees. Plain functions, so the store and the screens say it the same way.
 */

/**
 * What the tracker itself called the session: "Tennis" only because the
 * tracker labelled it tennis (WHOOP's sport name, Apple's Tennis workout,
 * Fitbit's, Oura's or Polar's own activity type; the server files nothing
 * else, migrations 58 and 69), otherwise the tracker's own sport name as it
 * gave it ("Functional fitness"). Never a time of day: "Lunchtime tennis"
 * named something the tracker never said.
 */
export function sportName(sport: string | undefined | null): string {
  const words = (sport ?? '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Activity';
}

/** "Tennis". */
export const activityTitle = (a: Pick<DetectedActivity, 'sport'>) => sportName(a.sport);

/** The calendar day it was played where it was played, when the tracker said where; otherwise on this phone's clock. */
export function activityDay(a: DetectedActivity): string {
  if (a.tzOffsetMin != null) return new Date(Date.parse(a.startedAt) + a.tzOffsetMin * 60000).toISOString().slice(0, 10);
  return localDay(a.startedAt);
}

/** "6:12 PM" → "6:12" and "pm", so a range can say "pm" once. A 24-hour clock has no mark. */
function clock(at: Date): { time: string; mark: string } {
  const s = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const m = /^(.*?)[\s ]*([AaPp][.]?[Mm][.]?)$/.exec(s);
  return m ? { time: m[1], mark: m[2].replace(/[.]/g, '').toLowerCase() } : { time: s, mark: '' };
}

/** "Today, 6:12–7:36 pm", "Yesterday, …" or "Mon Sep 29, …". `sep` goes between the day and the times. */
export function activityWhen(a: DetectedActivity, now = new Date(), sep = ', '): string {
  const start = new Date(a.startedAt);
  const from = clock(start);
  const to = clock(new Date(a.endedAt));
  const range = from.mark === to.mark
    ? `${from.time}–${to.time}${to.mark ? ` ${to.mark}` : ''}`
    : `${from.time} ${from.mark}–${to.time} ${to.mark}`;
  const day = localDay(start);
  const label = day === localDay(now) ? 'Today'
    : day === localDay(now.getTime() - 86_400_000) ? 'Yesterday'
    // The locale's own order, without its commas, so the one comma left is the one before the times.
    : start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
  return `${label}${sep}${range}`;
}

/** Which label a session's numbers carry: an Apple Watch only when the workout says it was saved by one. */
export function statsSourceOf(a: DetectedActivity): StatsSource {
  if (a.source === 'whoop' || a.source === 'fitbit' || a.source === 'oura' || a.source === 'polar') return a.source;
  if (a.source === 'apple-health') return /^Watch[0-9]+,[0-9]+$/.test(a.device ?? '') ? 'apple-watch' : 'apple-health';
  return 'health-connect';
}

/**
 * Where a post's numbers came from, in words only, never a logo: WHOOP's
 * own attribution wording, and "From …" for Apple's, so it reads as the
 * source rather than a device tag.
 */
export function sourceLabel(s: StatsSource): string {
  switch (s) {
    case 'whoop': return 'Data by WHOOP';
    case 'apple-watch': return 'From Apple Watch';
    case 'apple-health': return 'From Apple Health';
    case 'fitbit': return 'From Fitbit';
    case 'oura': return 'From Oura';
    case 'polar': return 'From Polar';
    default: return 'From Health Connect';
  }
}

/** "From your WHOOP", "from your Apple Watch". */
export function fromWho(a: DetectedActivity): string {
  switch (statsSourceOf(a)) {
    case 'whoop': return 'your WHOOP';
    case 'apple-watch': return 'your Apple Watch';
    case 'apple-health': return 'Apple Health';
    case 'fitbit': return 'your Fitbit';
    case 'oura': return 'your Oura Ring';
    case 'polar': return 'your Polar';
    default: return 'your tracker';
  }
}

/** "171 max bpm · 141 avg · 612 kcal · Strain 14.2": what only the player sees. Missing numbers are left out; Strain is WHOOP's alone. */
export function privateLine(a: DetectedActivity): string {
  return [
    a.maxHr ? `${a.maxHr} max bpm` : null,
    a.avgHr ? `${a.avgHr} avg` : null,
    a.kcal ? `${a.kcal} kcal` : null,
    a.source === 'whoop' && a.strain != null ? `Strain ${a.strain.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * The stats a post carries from a tracker session: time on court always,
 * and only the health numbers the author chose to share ("Share health
 * data", any age), with the list itself. It is the same shape the server
 * rebuilds from the private record (post_session_stats, migration 72), so
 * the copy shown straight away matches what is saved.
 */
export function sessionFromActivity(a: DetectedActivity, share: HealthShareKey[]): SessionDetail {
  return withShare({
    focus: 'Tennis',
    minutes: a.minutes,
    drills: [],
    activityId: a.id,
    source: statsSourceOf(a),
    // The day it was played where it was played (never the time), as the server writes it (migration 65).
    ...(a.tzOffsetMin != null ? { day: activityDay(a) } : {}),
  }, a, share);
}

/** A piece of a stats line: words, a player's @handle (opens their profile), or "+2" for the rest of them (`more`). */
export type StatsBit = { text: string; userId?: ID; more?: boolean };

/** "@miraplays", "@miraplays and @samhits", as pieces, each handle its own. */
function handleBits(list: SessionWith[]): StatsBit[] {
  return list.flatMap((w, i) => [
    ...(i === 0 ? [] : [{ text: i === list.length - 1 ? ' and ' : ', ' }]),
    { text: `@${w.handle}`, userId: w.id },
  ]);
}

/**
 * Who a post's session was played with, as pieces: "vs @miraplays", "with
 * @devbackhand". Only players who accepted their tag are ever on a post
 * (migration 62), and anyone the viewer blocked is left out.
 */
export function peopleBits(s: SessionDetail, hidden: ID[] = []): { vs: StatsBit[] | null; with: StatsBit[] | null } {
  const { opponents, partners } = sessionPeople(s, hidden);
  return {
    vs: opponents.length ? [{ text: 'vs ' }, ...handleBits(opponents)] : null,
    with: partners.length ? [{ text: 'with ' }, ...handleBits(partners)] : null,
  };
}

/**
 * A post's stats as the pieces of one line, parted by " · ": "1h 24m · with
 * @devbackhand · 171 max bpm · Data by WHOOP" from a tracker, "Match · Won
 * vs @miraplays · 1h 30m" or "Practice with @devbackhand · 1h 15m" from your
 * own log.
 */
export function statsChunks(s: SessionDetail, hidden: ID[] = []): StatsBit[][] {
  const people = peopleBits(s, hidden);
  if (!s.activityId && s.sessionId) {
    const chunks: StatsBit[][] = [];
    if (s.kind === 'match') {
      const result = s.won === true ? 'Won' : s.won === false ? 'Lost' : '';
      // "Match · Won vs @mira", or "Match vs @mira" with no result given.
      if (result) chunks.push([{ text: 'Match' }], [{ text: result }, ...(people.vs ? [{ text: ' ' }, ...people.vs] : [])]);
      else chunks.push([{ text: 'Match' }, ...(people.vs ? [{ text: ' ' }, ...people.vs] : [])]);
      if (people.with) chunks.push(people.with);
    } else {
      chunks.push([{ text: s.kind ? KIND_LABEL[s.kind] : s.focus }, ...(people.with ? [{ text: ' ' }, ...people.with] : [])]);
    }
    chunks.push([{ text: duration(s.minutes) }]);
    return chunks;
  }
  return [
    [{ text: duration(s.minutes) }],
    people.vs,
    people.with,
    s.maxHr ? [{ text: `${s.maxHr} max bpm` }] : null,
    [{ text: sourceLabel(s.source ?? 'apple-health') }],
  ].filter((c): c is StatsBit[] => !!c);
}

/**
 * The stats line over a clip, which has one line only: what it was, the
 * result and the time first, so they are never what gets cut, then the
 * first player and how many more ("Match · Won · 1h 15m · vs @miraplays +2").
 * From a tracker, its own numbers and where they came from lead.
 */
export function reelStatsChunks(s: SessionDetail, hidden: ID[] = []): StatsBit[][] {
  const { opponents, partners } = sessionPeople(s, hidden);
  const all = [...opponents, ...partners];
  const lead = all[0];
  const people: StatsBit[] | null = lead
    ? [{ text: opponents.length ? 'vs ' : 'with ' }, { text: `@${lead.handle}`, userId: lead.id }, ...(all.length > 1 ? [{ text: ' ' }, { text: `+${all.length - 1}`, more: true }] : [])]
    : null;
  if (!s.activityId && s.sessionId) {
    const result = s.kind === 'match' ? (s.won === true ? 'Won' : s.won === false ? 'Lost' : '') : '';
    return [
      [{ text: s.kind ? KIND_LABEL[s.kind] : s.focus }],
      result ? [{ text: result }] : null,
      [{ text: duration(s.minutes) }],
      people,
    ].filter((c): c is StatsBit[] => !!c);
  }
  return [
    [{ text: duration(s.minutes) }],
    s.maxHr ? [{ text: `${s.maxHr} max bpm` }] : null,
    [{ text: sourceLabel(s.source ?? 'apple-health') }],
    people,
  ].filter((c): c is StatsBit[] => !!c);
}

/**
 * A post's stats in one line of words: "1h 24m · 171 max bpm · Data by
 * WHOOP" from a tracker, "Match · Won vs @miraplays · 1h 30m" from your own log.
 */
export function statsLine(s: SessionDetail, hidden: ID[] = []): string {
  return statsChunks(s, hidden).map((chunk) => chunk.map((b) => b.text).join('')).join(' · ');
}

/** A post carries a session's stats: one from a tracker, or one from your own log. A plain "minutes on court" does not count. */
export const hasSessionStats = (s: SessionDetail | undefined): boolean => !!s && (!!s.activityId || !!s.sessionId);

/* ------------------------------------------------- sessions you logged */

export const KIND_LABEL: Record<PracticeSession['kind'], string> = { practice: 'Practice', match: 'Match', drills: 'Drills', fitness: 'Fitness' };

/** "Practice", "Match · Won", "Match · Lost", "Drills". */
export function loggedLabel(s: Pick<PracticeSession, 'kind' | 'won'>): string {
  if (s.kind === 'match' && s.won !== undefined) return `Match · ${s.won ? 'Won' : 'Lost'}`;
  return KIND_LABEL[s.kind];
}

/** "Tuesday practice", "Sunday match": what a post from your log says when you leave the caption empty. */
export function loggedTitle(s: Pick<PracticeSession, 'kind' | 'day'>): string {
  const weekday = new Date(`${s.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
  return `${weekday} ${KIND_LABEL[s.kind].toLowerCase()}`;
}

/** "Today", "Yesterday" or "Mon Sep 29", for a day in your log. */
export function dayWords(day: string, now = new Date()): string {
  if (day === localDay(now)) return 'Today';
  if (day === localDay(now.getTime() - 86_400_000)) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
}

/** "Today", "Yesterday" or "Sep 29": a day in a few letters, for a small tile. */
export function shortDay(day: string, now = new Date()): string {
  if (day === localDay(now)) return 'Today';
  if (day === localDay(now.getTime() - 86_400_000)) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).replace(/,/g, '');
}

/**
 * The stats a post carries from a session you logged by hand: how long and
 * what it was (a match with its result), and nothing else. Never a heart
 * rate: your own log has none, and the server would strip one (migration 58).
 */
export function sessionFromLogged(s: PracticeSession): SessionDetail {
  return {
    focus: loggedLabel(s),
    minutes: s.minutes,
    drills: [],
    sessionId: s.id,
    kind: s.kind,
    day: s.day,
    ...(s.kind === 'match' && s.won !== undefined ? { won: s.won } : {}),
  };
}

/* ------------------------------------------- the session's own look (Oct 2) */

/** A duration as figures and units, for big numbers with small units: 42 → 42 m; 84 → 1 h 24 m; 65 → 1 h 05 m. */
export function durationParts(min: number): { n: string; u: string }[] {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return [{ n: String(m), u: 'm' }];
  return [{ n: String(Math.floor(m / 60)), u: 'h' }, { n: String(m % 60).padStart(2, '0'), u: 'm' }];
}

/** "1 hour 24 minutes", for a screen reader. */
export function spokenDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const mins = r || !h ? `${r} ${r === 1 ? 'minute' : 'minutes'}` : '';
  return [hours, mins].filter(Boolean).join(' ');
}

/** What it was in a word: "Match", "Practice", or "Tennis" when the post does not say (a tracker's session not logged, a post from before migration 65). */
export const kindWord = (s: Pick<SessionDetail, 'kind'>) => (s.kind ? KIND_LABEL[s.kind] : 'Tennis');

/** "Won", "Lost", or null when it was not a match with a result. */
export const resultWord = (s: Pick<SessionDetail, 'kind' | 'won'>) => (s.kind === 'match' && s.won !== undefined ? (s.won ? 'Won' : 'Lost') : null);

/**
 * The small line over a session's numbers: "MATCH · FRI OCT 2", "PRACTICE ·
 * TODAY". Just "TENNIS" when the post says neither what it was nor which day.
 */
export function sessionEyebrow(s: Pick<SessionDetail, 'kind' | 'day'>, now = new Date()): string {
  const kind = kindWord(s);
  return (s.day ? `${kind} · ${dayWords(s.day, now)}` : kind).toUpperCase();
}

/** "on court", or "active" for a gym session. */
export const onCourtWord = (s: Pick<SessionDetail, 'kind'>) => (s.kind === 'fitness' ? 'active' : 'on court');

/**
 * What the pill over a clip says, in the order it gives way: the time never,
 * then the third piece (heart rate, or the first player when there is no
 * heart rate), then the result (or what it was).
 */
export function pillPieces(s: SessionDetail, hidden: ID[] = []): { time: string; result: string; third: string | null } {
  const { opponents, partners } = sessionPeople(s, hidden);
  const lead = opponents[0] ?? partners[0];
  const first = lead ? (lead.name?.trim().split(/\s+/)[0] || `@${lead.handle}`) : '';
  return {
    time: duration(s.minutes),
    result: resultWord(s) ?? kindWord(s),
    third: s.maxHr ? `${s.maxHr} bpm` : lead ? `${opponents.length ? 'vs' : 'with'} ${first}` : null,
  };
}
