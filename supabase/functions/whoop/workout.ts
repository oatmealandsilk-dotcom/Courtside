// A WHOOP workout, and what of it CourtSide keeps. Pure, so Node can test it too.
/** WHOOP's time in each heart-rate zone, in milliseconds. Zone 0 is below zone 1. */
export type WhoopZones = {
  zone_zero_milli?: number; zone_one_milli?: number; zone_two_milli?: number;
  zone_three_milli?: number; zone_four_milli?: number; zone_five_milli?: number;
};
export type WhoopWorkout = { id: string; user_id: number; start: string; end: string; timezone_offset?: string; sport_name?: string; score_state?: string;
  score?: { strain?: number; average_heart_rate?: number; max_heart_rate?: number; kilojoule?: number; percent_recorded?: number;
    /** WHOOP's v2 name; `zone_duration` was v1's, read too in case one ever arrives that way. */
    zone_durations?: WhoopZones | null; zone_duration?: WhoopZones | null } };
/** Exactly WHOOP's tennis: never table tennis, paddle tennis, padel or pickleball. sport_id is gone since 09/01/2025, so the name is all there is. */
export const isTennis = (w: { sport_name?: string }) => (w.sport_name ?? '').trim().toLowerCase() === 'tennis';
/** WHOOP's '+hh:mm' / '-hh:mm' / 'Z' as minutes east of UTC, or null. */
export function tzMinutes(s?: string | null): number | null {
  if (!s) return null;
  if (s === 'Z') return 0;
  const m = /^([+-])([0-9]{2}):([0-9]{2})$/.exec(s);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}
const ZONE_KEYS = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'] as const;
/**
 * WHOOP's six zone times as CourtSide's five, in whole minutes, easiest
 * first: [zone 1, 2, 3, 4, 5], with zone 0 counted in zone 1. Null unless
 * WHOOP gave all six as plain numbers and at least a minute in total (never
 * a guess). The server checks them again (migration 65).
 */
export function zoneMinutes(z?: WhoopZones | null): number[] | null {
  if (!z || typeof z !== 'object') return null;
  const ms = ZONE_KEYS.map((k) => z[k]);
  if (ms.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return null;
  const [z0, z1, z2, z3, z4, z5] = ms as number[];
  const out = [z0 + z1, z2, z3, z4, z5].map((v) => Math.round(v / 60_000));
  return out.some((v) => v > 0) ? out : null;
}
/** The payload record_activity (migrations 58 and 65) checks and stores. */
export const toPayload = (w: WhoopWorkout) => ({
  sport: 'tennis', started_at: w.start, ended_at: w.end, tz_offset_min: tzMinutes(w.timezone_offset),
  avg_hr: w.score?.average_heart_rate ?? null, max_hr: w.score?.max_heart_rate ?? null,
  kcal: w.score?.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null,
  strain: w.score?.strain ?? null, percent_recorded: w.score?.percent_recorded ?? null,
  hr_zones: zoneMinutes(w.score?.zone_durations ?? w.score?.zone_duration),
  score_state: w.score_state ?? null, device: 'WHOOP',
});
