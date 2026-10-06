// A WHOOP workout, and what of it CourtSide keeps. Pure, so Node can test it too.
/** WHOOP's time in each heart-rate zone, in milliseconds. Zone 0 is below zone 1. */
export type WhoopZones = {
  zone_zero_milli?: number; zone_one_milli?: number; zone_two_milli?: number;
  zone_three_milli?: number; zone_four_milli?: number; zone_five_milli?: number;
};
export type WhoopWorkout = { id: string; user_id: number; start: string; end: string; timezone_offset?: string; sport_name?: string; score_state?: string;
  score?: { strain?: number; average_heart_rate?: number; max_heart_rate?: number; kilojoule?: number; percent_recorded?: number; distance_meter?: number | null;
    /** WHOOP's v2 name; `zone_duration` was v1's, read too in case one ever arrives that way. */
    zone_durations?: WhoopZones | null; zone_duration?: WhoopZones | null } };
/** Exactly WHOOP's tennis: never table tennis, paddle tennis, padel or pickleball. sport_id is gone since 09/01/2025, so the name is all there is. */
export const isTennis = (w: { sport_name?: string }) => (w.sport_name ?? '').trim().toLowerCase() === 'tennis';

/**
 * WHOOP's own sport names → CourtSide's short names (migration 107's list,
 * the same the phone gives Apple Health's workouts), so the same run from
 * WHOOP and from the Watch is one session, not two.
 */
const SLUGS: Record<string, string> = {
  tennis: 'tennis',
  running: 'run',
  cycling: 'ride', spin: 'ride', 'mountain biking': 'ride',
  'assault bike': 'cardio', climber: 'cardio',
  walking: 'walk',
  'hiking/rucking': 'hike',
  swimming: 'swim',
  weightlifting: 'strength', powerlifting: 'strength',
  'functional fitness': 'functional-strength',
  hiit: 'hiit',
  yoga: 'yoga', pilates: 'pilates', barre: 'barre', stretching: 'stretching',
  elliptical: 'elliptical', rowing: 'rowing', stairmaster: 'stairs', 'jumping rope': 'jump-rope',
  dance: 'dance',
  boxing: 'boxing', 'box fitness': 'boxing', kickboxing: 'kickboxing',
  'martial arts': 'martial-arts', 'jiu jitsu': 'martial-arts', wrestling: 'martial-arts',
  pickleball: 'pickleball', squash: 'squash', padel: 'padel', 'table tennis': 'table-tennis', badminton: 'badminton', racquetball: 'racquetball',
  soccer: 'soccer', basketball: 'basketball', volleyball: 'volleyball', golf: 'golf',
  'rock climbing': 'climbing',
  skiing: 'skiing', 'cross country skiing': 'skiing', snowboarding: 'snowboarding', surfing: 'surfing',
  kayaking: 'paddling', paddleboarding: 'paddling',
  'track & field': 'track',
  'inline skating': 'skating', skateboarding: 'skating', 'ice skating': 'skating',
  'wheelchair pushing': 'wheelchair',
  // WHOOP's own catch-alls: a session it picked up by itself, or one named "Other".
  activity: 'workout', other: 'workout',
};
/** What WHOOP tracks that is not a workout to log: a sauna, a nap, a day at work. */
const NOT_WORKOUTS = new Set([
  'meditation', 'breathwork', 'ice bath', 'cold plunge', 'sauna', 'steam room', 'massage therapy', 'percussive massage', 'air compression',
  'watching sports', 'gaming', 'commuting', 'parenting', 'babywearing', 'high stress work', 'caddying', 'stage performance', 'coaching',
  'manual labor', 'gardening', 'motor racing', 'sex', 'nap', 'sleep',
]);
/**
 * The short name CourtSide keeps for a WHOOP workout ('run', 'strength',
 * 'tennis'); one not on the list in its own words ("Water Polo" →
 * 'water-polo'). Null for what is not a workout (a sauna, meditation, a
 * shift at work), which is never kept.
 */
export function sportOf(w: { sport_name?: string }): string | null {
  const name = (w.sport_name ?? '').trim().toLowerCase();
  if (!name) return 'workout';
  if (NOT_WORKOUTS.has(name) || name.startsWith('operations')) return null;
  const known = SLUGS[name];
  if (known) return known;
  const kebab = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return /^[a-z][a-z0-9-]{1,39}$/.test(kebab) ? kebab : 'workout';
}

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
/** A distance worth keeping, in whole metres; tennis never has one (as on the phone). */
const metres = (w: WhoopWorkout) => {
  const m = w.score?.distance_meter;
  return !isTennis(w) && typeof m === 'number' && Number.isFinite(m) && m > 0 ? Math.round(m) : null;
};
/** The payload record_activity (migrations 58, 65 and 107) checks and stores. */
export const toPayload = (w: WhoopWorkout) => ({
  sport: sportOf(w) ?? 'workout', started_at: w.start, ended_at: w.end, tz_offset_min: tzMinutes(w.timezone_offset),
  avg_hr: w.score?.average_heart_rate ?? null, max_hr: w.score?.max_heart_rate ?? null,
  kcal: w.score?.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null,
  strain: w.score?.strain ?? null, percent_recorded: w.score?.percent_recorded ?? null,
  hr_zones: zoneMinutes(w.score?.zone_durations ?? w.score?.zone_duration),
  score_state: w.score_state ?? null, device: 'WHOOP',
  ...(metres(w) ? { distance_m: metres(w) } : {}),
});
