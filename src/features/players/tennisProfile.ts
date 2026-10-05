/*
 * The words and numbers of a tennis profile (Oct 5): where a rating sits on
 * its scale, the band above it, the few numbers worth a player card, and the
 * short dates and lengths the page reads in. Pure functions, so the card, its
 * banner and the page all say the same thing.
 */
import type { PlayerProfile, PracticeSession, SurfacePreference, User } from '@/data/types';
import { fitnessLabel } from '@/lib/badges';
import { experienceLabel } from '@/lib/format';
import { localDay } from '@/features/practice/stats';
import { SCALES, ratingBand } from './ratingScales';

export type RatingSystem = PlayerProfile['skillSystem'];

/** A rating's scale as the ruler draws it. ITF counts down (1 is best), so it is drawn reversed: better is always to the right. */
export interface RulerScale {
  system: RatingSystem;
  min: number;
  max: number;
  /** One tick every `step`. */
  step: number;
  reversed: boolean;
  decimals: number;
}

export function rulerScale(system: RatingSystem): RulerScale {
  if (system === 'UTR') return { system, min: SCALES.UTR.min, max: SCALES.UTR.max, step: 1, reversed: false, decimals: 1 };
  // The old ITF numbers (1 best, 4 newest), kept for anyone who chose them before setup stopped offering it.
  if (system === 'ITF') return { system, min: 1, max: 4, step: 1, reversed: true, decimals: 0 };
  return { system, min: SCALES.NTRP.min, max: SCALES.NTRP.max, step: 0.5, reversed: false, decimals: 1 };
}

/** How far along the ruler a rating sits, 0 (left) to 1 (right). */
export function rulerAt(scale: RulerScale, rating: number): number {
  const t = (Math.min(scale.max, Math.max(scale.min, rating)) - scale.min) / (scale.max - scale.min);
  return scale.reversed ? 1 - t : t;
}

/** The rating as it is written: "4.0", "10.4", "2". */
export const ratingText = (p: Pick<PlayerProfile, 'skillSystem' | 'rating'>) => (p.skillSystem === 'ITF' ? String(Math.round(p.rating)) : p.rating.toFixed(1));

/** The level words for a rating ("Constructing points"); none for ITF, whose numbers carry no bands here. */
export const bandWords = (p: Pick<PlayerProfile, 'skillSystem' | 'rating'>): string | null => (p.skillSystem === 'ITF' ? null : ratingBand(p.skillSystem, p.rating));

/**
 * The next band up, for your own card: "Next band at 4.5 · Pace and spin on
 * demand". NTRP moves in half points, so the next band starts half a point
 * past this one's top; UTR moves in tenths, so it starts just past it. None
 * at the top band, and none for ITF.
 */
export function nextBand(p: Pick<PlayerProfile, 'skillSystem' | 'rating'>): { at: string; label: string } | null {
  if (p.skillSystem === 'ITF') return null;
  const bands = SCALES[p.skillSystem].bands;
  const i = bands.findIndex((b) => p.rating <= b.upTo);
  if (i < 0 || i >= bands.length - 1) return null;
  const at = p.skillSystem === 'NTRP' ? bands[i].upTo + 0.5 : bands[i].upTo + 0.1;
  return { at: at.toFixed(1), label: bands[i + 1].label };
}

/** The colour slot of a court surface, as a key of the palette: indoor courts wear the court green. */
export const surfaceSlot = (s: SurfacePreference): 'hard' | 'clay' | 'grass' | 'court' => (s === 'indoor' ? 'court' : s);

export const surfaceWord: Record<SurfacePreference, string> = { hard: 'Hard court', clay: 'Clay court', grass: 'Grass court', indoor: 'Indoor court' };

/** "Right-handed · Two-handed backhand". */
export const handsLine = (p: Pick<PlayerProfile, 'handedness' | 'backhand'>) => `${p.handedness === 'right' ? 'Right' : 'Left'}-handed · ${p.backhand === 'one-handed' ? 'One' : 'Two'}-handed backhand`;

/** Years playing as the setup asked it (a range kept as one number), as a figure for the strip: "10+", "1–3", "<1", "11". */
export function yearsFigure(years: number): string {
  if (years === 0) return '<1';
  const words = experienceLabel(years);
  return words.replace(/ years?$/, '');
}

/** Years playing in a sentence: "Playing 11 years", "Playing 4–9 years", "First year playing". */
export const yearsWords = (years: number) => (years === 0 ? 'First year playing' : `Playing ${experienceLabel(years)}`);

/** One number in the card's strip. `word` figures ("Elite") are set a little smaller than numbers. */
export interface StripItem {
  key: 'record' | 'hours' | 'sessions' | 'streak' | 'week' | 'years' | 'fitness' | 'next';
  figure: string;
  label: string;
  word?: boolean;
  /** For a screen reader: "24 wins, 17 losses". */
  spoken: string;
}

/**
 * The few numbers a player card leads with, most telling first: the record
 * (only once a match is logged), hours on court (once there is a whole one),
 * sessions, and a streak of two days or more. Never a zero, and never a half
 * empty strip: whatever room the real numbers leave is topped up from the
 * facts they gave (sessions a week, years playing, fitness), which then come
 * off the facts line under it. Labels are singular for a one ("1 Session").
 * Empty when there is nothing at all.
 */
export function stripItems(user: Pick<User, 'stats' | 'profile'>, max: number, lead: StripItem[] = []): StripItem[] {
  const s = user.stats;
  const p = user.profile;
  const real: StripItem[] = [];
  if (s.matchesPlayed > 0) {
    const lost = Math.max(0, s.matchesPlayed - s.matchesWon);
    real.push({ key: 'record', figure: `${s.matchesWon}–${lost}`, label: 'Record', spoken: `Record ${s.matchesWon} ${s.matchesWon === 1 ? 'win' : 'wins'} ${lost} ${lost === 1 ? 'loss' : 'losses'}` });
  }
  const hours = Math.round(s.hoursOnCourt);
  if (hours >= 1) real.push({ key: 'hours', figure: String(hours), label: hours === 1 ? 'Hour' : 'Hours', spoken: `${hours} ${hours === 1 ? 'hour' : 'hours'} on court` });
  if (s.sessionsLogged > 0) real.push({ key: 'sessions', figure: String(s.sessionsLogged), label: s.sessionsLogged === 1 ? 'Session' : 'Sessions', spoken: `${s.sessionsLogged} ${s.sessionsLogged === 1 ? 'session' : 'sessions'}` });
  if (s.currentStreakDays >= 2) real.push({ key: 'streak', figure: String(s.currentStreakDays), label: 'Day streak', spoken: `${s.currentStreakDays}-day streak` });
  const facts: StripItem[] = [];
  if (p.sessionsPerWeek !== undefined && p.sessionsPerWeek > 0) facts.push({ key: 'week', figure: `${p.sessionsPerWeek}×`, label: 'A week', spoken: `Plays ${p.sessionsPerWeek} ${p.sessionsPerWeek === 1 ? 'time' : 'times'} a week` });
  if (p.yearsPlaying !== undefined) facts.push({ key: 'years', figure: yearsFigure(p.yearsPlaying), label: p.yearsPlaying <= 1 ? 'Year playing' : 'Years playing', spoken: `${experienceLabel(p.yearsPlaying)} playing` });
  if (p.fitnessLevel) facts.push({ key: 'fitness', figure: fitnessLabel[p.fitnessLevel], label: 'Fitness', word: true, spoken: `${fitnessLabel[p.fitnessLevel]} fitness` });
  const out = [...lead];
  for (const item of [...real, ...facts]) {
    if (out.length >= max) break;
    if (!out.some((o) => o.key === item.key)) out.push(item);
  }
  return out;
}

/**
 * The facts under how someone plays, one phrase each, leaving out whatever the
 * strip already shows and whatever they skipped: "On court 4× a week",
 * "Playing 11 years", "Fitness: competitive". Kept apart so a line only ever
 * breaks between two of them.
 */
export function factsList(p: PlayerProfile, shown: StripItem[]): string[] {
  const has = (k: StripItem['key']) => shown.some((s) => s.key === k);
  return [
    p.sessionsPerWeek !== undefined && p.sessionsPerWeek > 0 && !has('week') ? `On court ${p.sessionsPerWeek}× a week` : '',
    p.yearsPlaying !== undefined && !has('years') ? yearsWords(p.yearsPlaying) : '',
    p.fitnessLevel && !has('fitness') ? `Fitness: ${fitnessLabel[p.fitnessLevel].toLowerCase()}` : '',
  ].filter(Boolean);
}

/** A length in the page's short form: "45m", "1h 30m", "2h". */
export function shortLength(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Whole days from today to a day (negative once it has gone), by the calendar on this phone. */
export function daysUntil(iso: string, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(new Date(iso)) - day(now)) / 86_400_000);
}

/** A date the page's way: "Sep 28", with the year only when it is not this year. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A logged day the page's way: "Today", "Yesterday", the weekday within the week, otherwise "Sep 28". */
export function dayLabel(day: string, now = new Date()): string {
  if (day === localDay(now)) return 'Today';
  if (day === localDay(now.getTime() - 86_400_000)) return 'Yesterday';
  const d = new Date(`${day}T12:00:00`);
  const ago = -daysUntil(d.toISOString(), now);
  if (ago > 0 && ago <= 6) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return shortDate(d.toISOString(), now);
}

/** A tournament's date: "Sat, Oct 31" (the year only when it is not this year). */
export function eventDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Minutes on court (fitness left out) in the last seven days, today included. */
export function weekOnCourt(sessions: PracticeSession[], me: string | null, now = new Date()): number {
  const from = localDay(now.getTime() - 6 * 86_400_000);
  return sessions.filter((s) => s.userId === me && s.kind !== 'fitness' && s.day >= from).reduce((sum, s) => sum + s.minutes, 0);
}

/** Your newest sessions first, the way Your sessions lists them. */
export const newestFirst = (a: PracticeSession, b: PracticeSession) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt.localeCompare(a.createdAt));

/** The city of a "City, ST" location. */
export const cityOf = (location: string) => location.split(',')[0].trim();
