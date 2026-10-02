// A WHOOP workout, and what of it CourtSide keeps. Pure, so Node can test it too.
export type WhoopWorkout = { id: string; user_id: number; start: string; end: string; timezone_offset?: string; sport_name?: string; score_state?: string;
  score?: { strain?: number; average_heart_rate?: number; max_heart_rate?: number; kilojoule?: number; percent_recorded?: number } };
/** Exactly WHOOP's tennis: never table tennis, paddle tennis, padel or pickleball. sport_id is gone since 09/01/2025, so the name is all there is. */
export const isTennis = (w: { sport_name?: string }) => (w.sport_name ?? '').trim().toLowerCase() === 'tennis';
/** WHOOP's '+hh:mm' / '-hh:mm' / 'Z' as minutes east of UTC, or null. */
export function tzMinutes(s?: string | null): number | null {
  if (!s) return null;
  if (s === 'Z') return 0;
  const m = /^([+-])([0-9]{2}):([0-9]{2})$/.exec(s);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}
/** The payload record_activity (migration 58) checks and stores. Zone times are left out on purpose. */
export const toPayload = (w: WhoopWorkout) => ({
  sport: 'tennis', started_at: w.start, ended_at: w.end, tz_offset_min: tzMinutes(w.timezone_offset),
  avg_hr: w.score?.average_heart_rate ?? null, max_hr: w.score?.max_heart_rate ?? null,
  kcal: w.score?.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null,
  strain: w.score?.strain ?? null, percent_recorded: w.score?.percent_recorded ?? null,
  score_state: w.score_state ?? null, device: 'WHOOP',
});
