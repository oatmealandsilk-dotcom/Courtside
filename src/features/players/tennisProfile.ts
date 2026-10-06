/*
 * The words and numbers of a tennis profile (Oct 5): the rating as it is
 * written, the few numbers worth a player card, and the short dates and
 * lengths the page reads in. Pure functions, so the card, its banner and the
 * page all say the same thing.
 */
import type { DetectedActivity, ID, PlayerProfile, PracticeSession, SurfacePreference, User } from '@/data/types';
import { activityDay } from '@/features/activity/format';
import { fitnessLabel } from '@/lib/badges';
import { experienceLabel } from '@/lib/format';
import { localDay } from '@/features/practice/stats';

export type RatingSystem = PlayerProfile['skillSystem'];

/** The rating as it is written: "4.0", "10.4", "2". */
export const ratingText = (p: Pick<PlayerProfile, 'skillSystem' | 'rating'>) => (p.skillSystem === 'ITF' ? String(Math.round(p.rating)) : p.rating.toFixed(1));

/** The colour slot of a court surface, as a key of the palette: indoor courts wear the court green. */
export const surfaceSlot = (s: SurfacePreference): 'hard' | 'clay' | 'grass' | 'court' => (s === 'indoor' ? 'court' : s);

export const surfaceWord: Record<SurfacePreference, string> = { hard: 'Hard court', clay: 'Clay court', grass: 'Grass court', indoor: 'Indoor court' };

/** "Right-handed · Two-handed backhand". */
export const handsLine = (p: Pick<PlayerProfile, 'handedness' | 'backhand'>) => `${p.handedness === 'right' ? 'Right' : 'Left'}-handed · ${p.backhand === 'one-handed' ? 'One' : 'Two'}-handed backhand`;

/**
 * A tournament's name as a card shows it: as typed, except a short name with
 * no vowels in it, which can only be letters standing for something ("rrc",
 * typed on a phone that capitalised it to "Rrc"), set in capitals: "RRC".
 */
export function tournamentName(name: string): string {
  const n = name.trim();
  return /^[a-z]{2,5}$/i.test(n) && !/[aeiouy]/i.test(n) ? n.toUpperCase() : n;
}

/* ----------------------------- Years playing ----------------------------- */

/**
 * The years setup takes for when you started playing, up to this one. Back
 * to 1940: no birthday reaches the app, so it cannot be "three years after
 * you were born", except that a teen account (13 to 17) starts three years
 * after the earliest a 17-year-old could have been born.
 */
export function startedYearBounds(ageGroup?: 'teen' | 'adult', now = new Date()): { min: number; max: number } {
  const max = now.getFullYear();
  return { min: ageGroup === 'teen' ? max - 15 : 1940, max };
}

/** A started year as stored, when it is one: a whole year from 1900 to this one. */
function startedYearOf(p: Pick<PlayerProfile, 'startedYear'>, now: Date): number | null {
  if (p.startedYear == null) return null;
  const y = Number(p.startedYear);
  return Number.isInteger(y) && y >= 1900 && y <= now.getFullYear() ? y : null;
}

/**
 * How long someone has played: from the year they started when they gave
 * one (`since`), otherwise the range setup used to ask (a profile saved
 * before Oct 5, shown as it was until they edit it). Null when they skipped it.
 */
export function playingFor(p: Pick<PlayerProfile, 'startedYear' | 'yearsPlaying'>, now = new Date()): { years: number; since?: number } | null {
  const since = startedYearOf(p, now);
  if (since !== null) return { years: now.getFullYear() - since, since };
  return p.yearsPlaying !== undefined ? { years: p.yearsPlaying } : null;
}

/** The old years-playing number, kept beside a started year for an app from before it: this year minus that one. */
export const yearsFromStarted = (year: number, now = new Date()) => Math.max(0, now.getFullYear() - year);

/** Years playing as a figure for the strip: "9", or "1st" in the year they started; an older range as it was: "10+", "1–3", "<1". */
export function yearsFigure(play: { years: number; since?: number }): string {
  if (play.since !== undefined) return play.years === 0 ? '1st' : String(play.years);
  if (play.years === 0) return '<1';
  return experienceLabel(play.years).replace(/ years?$/, '');
}

/** Years playing in a sentence: "Playing 9 years, since 2017", "Started playing this year"; an older range: "Playing 4–9 years", "First year playing". */
export function yearsWords(play: { years: number; since?: number }): string {
  if (play.since !== undefined) return play.years === 0 ? 'Started playing this year' : `Playing ${play.years} ${play.years === 1 ? 'year' : 'years'}, since ${play.since}`;
  return play.years === 0 ? 'First year playing' : `Playing ${experienceLabel(play.years)}`;
}

/* ------------------------------- Per week -------------------------------- */

/**
 * The one sessions-a-week number a card shows (Oct 5, owner: "Let's only do
 * one. Maybe if you have tracker it's just tracker if no tracker then you
 * can select"). `real`: counted from the last four weeks, on your own card
 * while a tracker is on (usePerWeek); otherwise what they picked in setup.
 */
export interface PerWeek { value: number; real: boolean }

/** What they picked in setup, when they did. */
export const pickedPerWeek = (p: Pick<PlayerProfile, 'sessionsPerWeek'>): PerWeek | null =>
  (p.sessionsPerWeek !== undefined && p.sessionsPerWeek > 0 ? { value: p.sessionsPerWeek, real: false } : null);

/**
 * Tennis sessions a week over the last four weeks, today included: the ones
 * logged (fitness left out) and a tracker's still waiting to be logged
 * (`waiting`, already narrowed to tennis from a source that is on; a logged
 * one is in `sessions` already). 9 in 28 days is 2.25 a week.
 */
export function realPerWeek(sessions: PracticeSession[], waiting: DetectedActivity[], me: ID, now = new Date()): number {
  const from = localDay(now.getTime() - 27 * 86_400_000);
  const logged = sessions.filter((s) => s.userId === me && s.kind !== 'fitness' && s.day >= from).length;
  const unlogged = waiting.filter((a) => a.userId === me && a.status === 'new' && activityDay(a) >= from).length;
  return (logged + unlogged) / 4;
}

/** A week's number as written: "2", "2.3" (one decimal, none when it is whole), "12". */
export const perWeekText = (n: number) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''));

/* --------------------------------- Strip --------------------------------- */

/** One number in the card's strip. `word` figures ("Elite") are set a little smaller than numbers. */
export interface StripItem {
  key: 'record' | 'hours' | 'week' | 'sessions' | 'streak' | 'years' | 'fitness' | 'next';
  figure: string;
  /** Set small after the figure, as a unit: "50 days". */
  unit?: string;
  label: string;
  word?: boolean;
  /** For a screen reader: "24 wins, 17 losses". */
  spoken: string;
}

/**
 * The few numbers a player card leads with, most telling first: the record
 * (only once a match is logged), hours on court (once there is a whole one),
 * sessions a week, and a streak of two days or more. Sessions are said once:
 * `week` (real with a tracker, else what they picked), and only when there
 * is neither, the count of sessions logged. Never a zero, except a tracker's
 * own count: a tracker that brought no tennis in four weeks says "0" a week,
 * never the all-time total in its place (Oct 5, owner). Never a half empty
 * strip: whatever room is left is topped up from the facts they gave (years
 * playing, fitness), which then come off the facts line under it. Labels are
 * singular for a one ("1 Session"). Empty when there is nothing.
 */
export function stripItems(user: Pick<User, 'stats' | 'profile'>, max: number, week: PerWeek | null = pickedPerWeek(user.profile), now = new Date()): StripItem[] {
  const s = user.stats;
  const p = user.profile;
  const items: StripItem[] = [];
  if (s.matchesPlayed > 0) {
    const lost = Math.max(0, s.matchesPlayed - s.matchesWon);
    items.push({ key: 'record', figure: `${s.matchesWon}–${lost}`, label: 'Record', spoken: `Record ${s.matchesWon} ${s.matchesWon === 1 ? 'win' : 'wins'} ${lost} ${lost === 1 ? 'loss' : 'losses'}` });
  }
  const hours = Math.round(s.hoursOnCourt);
  if (hours >= 1) items.push({ key: 'hours', figure: String(hours), label: hours === 1 ? 'Hour' : 'Hours', spoken: `${hours} ${hours === 1 ? 'hour' : 'hours'} on court` });
  if (week && (week.real || week.value > 0)) {
    const n = perWeekText(week.value);
    const one = n === '1';
    items.push({ key: 'week', figure: n, label: 'Per week', spoken: week.real ? `${n} ${one ? 'session' : 'sessions'} a week over the last 4 weeks` : `Plays ${n} ${one ? 'time' : 'times'} a week` });
  } else if (s.sessionsLogged > 0) {
    items.push({ key: 'sessions', figure: String(s.sessionsLogged), label: s.sessionsLogged === 1 ? 'Session' : 'Sessions', spoken: `${s.sessionsLogged} ${s.sessionsLogged === 1 ? 'session' : 'sessions'}` });
  }
  if (s.currentStreakDays >= 2) items.push({ key: 'streak', figure: String(s.currentStreakDays), label: 'Day streak', spoken: `${s.currentStreakDays}-day streak` });
  const play = playingFor(p, now);
  if (play) items.push({ key: 'years', figure: yearsFigure(play), label: play.years <= 1 ? 'Year playing' : 'Years playing', spoken: yearsWords(play) });
  if (p.fitnessLevel) items.push({ key: 'fitness', figure: fitnessLabel[p.fitnessLevel], label: 'Fitness', word: true, spoken: `${fitnessLabel[p.fitnessLevel]} fitness` });
  return items.slice(0, Math.max(0, max));
}

/**
 * The facts under how someone plays, one phrase each, leaving out whatever the
 * strip already shows and whatever they skipped: "Playing 9 years, since
 * 2017", "Fitness: competitive". Kept apart so a line only ever breaks
 * between two of them. Sessions a week is said once, in the strip, never here.
 */
export function factsList(p: PlayerProfile, shown: StripItem[], now = new Date()): string[] {
  const has = (k: StripItem['key']) => shown.some((s) => s.key === k);
  const play = playingFor(p, now);
  return [
    play && !has('years') ? yearsWords(play) : '',
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
