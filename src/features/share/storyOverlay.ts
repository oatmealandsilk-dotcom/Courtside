import type { SessionDetail } from '@/data/types';
import { durationParts, hasSessionStats, resultWord, scoreLine, sourceLabel, whatWord } from '@/features/activity/format';
import { distanceFigure } from '@/features/activity/workouts';

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
