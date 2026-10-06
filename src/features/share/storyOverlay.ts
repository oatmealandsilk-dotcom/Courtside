import type { SessionDetail } from '@/data/types';
import { durationParts, hasSessionStats, resultWord, scoreLine, sourceLabel, whatWord } from '@/features/activity/format';
import { distanceFigure } from '@/features/activity/workouts';
import { mixHex } from '@/features/activity/zones';
import { colors, pageIsDark } from '@/theme';

/*
 * What the CourtSide overlay on a clip or photo shared to an Instagram story
 * says about the session on the post (StoryOverlay.tsx), worked out here so
 * the picture only draws it. Strava's stats sticker is the model: at most two
 * numbers, each a small label over a big figure, never a crowd of them.
 *
 * Only what the post itself carries is ever used: the server keeps only the
 * health numbers its author chose to share (migration 72), and a tracker's
 * numbers always say where they came from ("Data by WHOOP"), as every other
 * share picture does (sessionStory.ts).
 */

/** A figure in pieces: the number in full size, its unit ("h ", " cal") small beside it, on the same baseline. */
export type FigurePiece = { text: string; unit?: boolean };

export interface OverlayStat {
  /** "Match", "Won", "Calories". */
  label: string;
  value: FigurePiece[];
}

export interface OverlayStats {
  /** One or two columns, the time first. */
  stats: OverlayStat[];
  /** "Data by WHOOP", "From Apple Watch": a tracker's numbers are on it. */
  source?: string;
}

/** "1h 24m" as pieces: the figures big, the h and m small (Duration's look); "48m" under an hour. */
function timePieces(minutes: number): FigurePiece[] {
  const parts = durationParts(minutes);
  return parts.flatMap((p, i) => [{ text: p.n }, { text: i < parts.length - 1 ? `${p.u} ` : p.u, unit: true }]);
}

/** The second number, when the post has one: the score, then a workout's distance, then calories, then heart rate. */
function secondStat(s: SessionDetail): OverlayStat | null {
  const result = resultWord(s);
  const score = scoreLine(s);
  if (score) return { label: result ?? 'Score', value: [{ text: score }] };
  if (result) return { label: 'Result', value: [{ text: result }] };
  const far = s.workout ? distanceFigure(s.distanceM) : null;
  if (far) return { label: 'Distance', value: [{ text: far.value < 10 ? far.value.toFixed(1) : String(far.value) }, { text: ` ${far.unit}`, unit: true }] };
  if (s.kcal) return { label: 'Calories', value: [{ text: String(s.kcal) }, { text: ' cal', unit: true }] };
  // Heart rate the way the session stamp shows it: shared only when the max is (migration 72).
  if (s.maxHr != null && s.avgHr) return { label: 'Avg HR', value: [{ text: String(s.avgHr) }, { text: ' bpm', unit: true }] };
  if (s.maxHr != null) return { label: 'Max HR', value: [{ text: String(s.maxHr) }, { text: ' bpm', unit: true }] };
  return null;
}

/**
 * The session's numbers for the overlay, or null when the post has none worth
 * showing (no session, or only a bare "minutes on court": hasSessionStats).
 */
export function overlayStats(s: SessionDetail | undefined): OverlayStats | null {
  if (!s || !hasSessionStats(s)) return null;
  const stats: OverlayStat[] = [];
  if (s.minutes > 0) stats.push({ label: whatWord(s), value: timePieces(s.minutes) });
  const second = secondStat(s);
  if (second) stats.push(second);
  if (!stats.length) return null;
  return { stats, ...(s.activityId ? { source: sourceLabel(s.source ?? 'apple-health') } : {}) };
}

/**
 * The two colours round a story's picture where it does not fill the
 * screen: the court's darkest colour, faintly tinted with the court at the
 * top, as the session's Overlay design uses. Instagram fills round a clip
 * that is not 9:16 with them (mediaStory.ts), and a landscape or square
 * photo is drawn over them (StoryOverlayCanvas), so both look alike.
 */
export function storyFill(): { top: string; bottom: string } {
  const deep = (pageIsDark() ? colors.bg : colors.text).slice(0, 7);
  return { top: mixHex(deep, colors.court.slice(0, 7), 0.15), bottom: deep };
}

/*
 * How wide a line of the overlay comes out, before it is drawn, so the
 * numbers can pick a layout that fits rather than be cut off with "…" (a
 * three-set score with a match tiebreak, "6–4 3–6 10–7", did not fit beside
 * the time). Inter's own widths, in parts of the type size: every figure is
 * the same width (tabular figures), the dash and space narrower, m and w
 * wide, other letters at a generous average. A few per cent spare covers
 * the rest.
 */
const EM = { digit: 0.647, dash: 0.5, space: 0.27, point: 0.3, wide: 0.92, letter: 0.62 } as const;
/** The figures' tighter tracking (Figure in StoryOverlay.tsx), in parts of the type size. */
export const FIGURE_TRACKING = -0.04;

function ems(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += /\d/.test(ch) ? EM.digit : ch === ' ' ? EM.space : ch === '–' || ch === '-' ? EM.dash : ch === '.' || ch === ',' ? EM.point : /[mwMW]/.test(ch) ? EM.wide : EM.letter;
  }
  return w;
}

/** A figure's width at `size`: the number at full size with its tracking, the units at half size. */
export function figureWidth(pieces: FigurePiece[], size: number): number {
  return pieces.reduce((w, p) => w + (p.unit ? ems(p.text) * size * 0.5 : (ems(p.text) + FIGURE_TRACKING * [...p.text].length) * size), 0);
}

/** A small label's width ("Match", "Won") at `size`. */
export const labelWidth = (text: string, size: number) => ems(text) * size;

/** The small label's size over each figure, in units of a 360-wide story. */
export const LABEL_SIZE = 11;
/** The figures' sizes, largest first: the size they are drawn at is the largest that fits. */
const FIGURE_SIZES = [26, 23, 21] as const;

export interface OverlayFit {
  /** The figures' type size, in units of a 360-wide story. */
  size: number;
  /** The space between the two columns. */
  gap: number;
  /** One above the other instead of side by side: a score too long to sit beside the time. */
  stacked: boolean;
}

/**
 * How the numbers sit within `maxW` (units of a 360-wide story): side by
 * side, as Strava's stats sticker has them, at the largest size that fits;
 * failing that (a long score), one above the other, each label over its
 * figure, at the largest size where the widest figure still fits, rather
 * than cut off.
 */
export function overlayFit(stats: OverlayStat[], maxW: number): OverlayFit {
  const spare = 1.04;
  const colW = (st: OverlayStat, size: number) => Math.max(labelWidth(st.label, LABEL_SIZE), figureWidth(st.value, size));
  for (const size of FIGURE_SIZES) {
    const gap = size >= 26 ? 20 : 16;
    const total = stats.reduce((w, st) => w + colW(st, size), 0) + gap * (stats.length - 1);
    if (total * spare <= maxW) return { size, gap, stacked: false };
  }
  for (const size of [26, 23, 21, 19, 17]) {
    if (stats.every((st) => colW(st, size) * spare <= maxW)) return { size, gap: 0, stacked: true };
  }
  return { size: 16, gap: 0, stacked: true };
}
