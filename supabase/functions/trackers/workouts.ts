// Fitbit (through Google's Health API since Oct 10), Oura and Polar workouts,
// and what of each CourtSide keeps. Pure, so Node can test it too. Every
// tracker's tennis session becomes the same payload WHOOP's does
// (record_activity, migrations 58 and 69).

export type ProviderId = 'fitbit' | 'oura' | 'polar';
export const PROVIDERS: ProviderId[] = ['fitbit', 'oura', 'polar'];
export const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && (PROVIDERS as string[]).includes(p);

/** What record_activity checks and stores. Missing numbers are null; nothing else is sent. */
export type Payload = {
  sport: 'tennis'; started_at: string; ended_at: string; tz_offset_min: number | null;
  avg_hr: number | null; max_hr: number | null; kcal: number | null; device: string;
  /** Minutes in each heart-rate zone, easiest first (migration 65). Fitbit's only, and only when Google has them. */
  hr_zones?: number[];
};
/** One tennis session, ready to file: the tracker's own id for it and the payload. */
export type Session = { ext: string; payload: Payload };

const lower = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

/** ISO 8601 duration ('PT1H24M30.5S') in milliseconds, or null. */
export function isoDurationMs(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim());
  if (!m || s.trim() === 'P' || s.trim() === 'PT') return null;
  const [, d, h, mi, se] = m;
  return ((Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(mi ?? 0)) * 60_000 + Math.round(Number(se ?? 0) * 1000);
}

/** The '+hh:mm' / '-hh:mm' / 'Z' on the end of an ISO time, as minutes east of UTC, or null when it has none. */
export function offsetOf(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  if (/Z$/i.test(iso)) return 0;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  if (!m || !/T/.test(iso)) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const iso = (ms: number) => new Date(ms).toISOString();

// ------------------------------------------------------------------ Fitbit
// Through Google's Health API since Oct 10, 2026 (owner, Oct 10: "Also can we
// make fibit work too"): Fitbit's own Web API shuts on Oct 30, 2026, and a
// Fitbit now belongs to the Google account it signs in with. One workout is
// one "exercise" in
// GET https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints
// (developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints).
// Google sends whole numbers as text ("148"), lengths of time as seconds with
// an "s" ("900s", "-18000s"), and every time in UTC ("2026-02-23T06:00:00Z").
export type FitbitExercise = {
  /** "users/<player>/dataTypes/exercise/dataPoints/<the workout's own id>" */
  name?: string;
  dataSource?: { platform?: string; device?: { displayName?: string } };
  exercise?: {
    interval?: { startTime?: string; endTime?: string; startUtcOffset?: string };
    exerciseType?: string; displayName?: string;
    /** The workout without its pauses. */
    activeDuration?: string;
    metricsSummary?: {
      caloriesKcal?: number; averageHeartRateBeatsPerMinute?: string | number;
      heartRateZoneDurations?: { lightTime?: string; moderateTime?: string; vigorousTime?: string; peakTime?: string };
    };
  };
};

/** Google's "<seconds>s" ("900s", "-18000s", "1.5s") as seconds, or null. */
export function googleSeconds(s: unknown): number | null {
  if (typeof s !== 'string' || !/^-?\d+(\.\d+)?s$/.test(s.trim())) return null;
  return parseFloat(s);
}
/** A number Google may send as text ("148"), kept as num() keeps it. */
const whole = (v: unknown) => num(typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);

/**
 * Google's own "TENNIS", exactly: never TABLE_TENNIS, PADEL, PICKELBALL
 * (Google's spelling), SQUASH, BADMINTON, RACQUETBALL or the catch-all
 * RACKET_SPORTS. Also a workout of type OTHER the player named "Tennis"
 * themselves (only OTHER keeps a player's own name; Google names every other
 * type itself). Google has not written down how Fitbit's old "Tennis"
 * (activity type 15675) arrives: TENNIS is the plain reading, to be checked
 * with one real session.
 */
export const fitbitIsTennis = (e: FitbitExercise) =>
  e.exercise?.exerciseType === 'TENNIS' || (e.exercise?.exerciseType === 'OTHER' && lower(e.exercise?.displayName) === 'tennis');

/**
 * Workouts another app put into Google Health (an Apple Watch's through Apple
 * Health, a Galaxy Watch's through Health Connect, Google Fit's, an app
 * writing to Google's own API, to Fitbit's old Web API or through a Google
 * partner): never filed as the player's Fitbit. CourtSide reads the phone's
 * Health itself, so they would come in twice, and under the wrong name.
 * index.ts already asks Google for only what a Fitbit or Pixel Watch recorded
 * (its "google-wearables" source family); this is the backstop for when
 * Google refuses that, and a Fitbit's or Pixel Watch's own workouts stay.
 */
const OTHER_APPS = new Set(['HEALTH_KIT', 'HEALTH_CONNECT', 'FIT', 'FITBIT_WEB_API', 'GOOGLE_WEB_API', 'GOOGLE_PARTNER_INTEGRATION']);
export const fitbitFromOtherApp = (e: FitbitExercise) => OTHER_APPS.has(e.dataSource?.platform ?? '');

/**
 * Google's time in its four heart-rate zones as CourtSide's five, in whole
 * minutes, easiest first: [Easy, Light, Moderate, Hard, Peak], Google's
 * "vigorous" being our Hard. Google has no zone below Light, so Easy is the
 * rest of the workout's moving time, the way WHOOP's zone 0 is counted in
 * Easy (zoneMinutes, whoop/workout.ts). A zone Google leaves out had no time
 * in it. Null when Google gave no zones, or no heart rate for the workout at
 * all. The server checks them again (migration 65).
 */
export function fitbitZones(e: FitbitExercise, spanMs: number): number[] | null {
  const m = e.exercise?.metricsSummary;
  const z = m?.heartRateZoneDurations;
  if (!z || typeof z !== 'object' || whole(m?.averageHeartRateBeatsPerMinute) == null) return null;
  const given = [z.lightTime, z.moderateTime, z.vigorousTime, z.peakTime];
  if (given.every((v) => v == null)) return null;
  const secs = given.map((v) => (v == null ? 0 : googleSeconds(v)));
  if (secs.some((v) => v == null || v < 0)) return null;
  const [light, moderate, vigorous, peak] = secs as number[];
  const moving = Math.min(googleSeconds(e.exercise?.activeDuration) ?? Infinity, spanMs / 1000);
  const easy = Math.max(0, moving - (light + moderate + vigorous + peak));
  const out = [easy, light, moderate, vigorous, peak].map((s) => Math.round(s / 60));
  return out.some((v) => v > 0) ? out : null;
}

/**
 * One Fitbit workout as a tennis session. `hr` is Google's heart rate over
 * exactly its time (index.ts asks for it): the highest beat is only there,
 * never in the workout itself, and its average stands in when the workout has
 * none. The workout's own id is the last part of its name.
 */
export function fitbitSession(e: FitbitExercise, hr?: { avg: number | null; max: number | null } | null): Session | null {
  const span = e.exercise?.interval;
  const t0 = Date.parse(span?.startTime ?? '');
  const t1 = Date.parse(span?.endTime ?? '');
  const ext = typeof e.name === 'string' ? e.name.split('/').pop() ?? '' : '';
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || !ext || ext.length > 100) return null;
  // Google's times are always UTC: the player's own clock comes apart, in seconds.
  const off = googleSeconds(span?.startUtcOffset);
  const sum = e.exercise?.metricsSummary;
  const zones = fitbitZones(e, t1 - t0);
  return {
    ext,
    payload: {
      sport: 'tennis', started_at: iso(t0), ended_at: iso(t1),
      tz_offset_min: off != null && Math.abs(off) <= 14 * 3600 ? Math.round(off / 60) : null,
      avg_hr: whole(sum?.averageHeartRateBeatsPerMinute) ?? num(hr?.avg), max_hr: num(hr?.max), kcal: num(sum?.caloriesKcal),
      device: (typeof e.dataSource?.device?.displayName === 'string' && e.dataSource.device.displayName.trim()) || 'Fitbit',
      ...(zones ? { hr_zones: zones } : {}),
    },
  };
}

// -------------------------------------------------------------------- Oura
// GET /v2/usercollection/workout (cloud.ouraring.com/v2/docs#tag/Workout-Routes)
export type OuraWorkout = { id: string; activity?: string; start_datetime?: string; end_datetime?: string; calories?: number | null };
export type OuraBeat = { bpm: number; timestamp: string };
export const ouraIsTennis = (w: OuraWorkout) => lower(w.activity) === 'tennis';
/** Average and highest heart rate inside a window, from Oura's heart rate samples. Null when there are too few to mean anything. */
export function beatsIn(beats: OuraBeat[], startMs: number, endMs: number): { avg: number; max: number } | null {
  const inside = beats.filter((b) => typeof b.bpm === 'number' && b.bpm > 0).filter((b) => { const t = Date.parse(b.timestamp); return t >= startMs && t <= endMs; }).map((b) => b.bpm);
  if (inside.length < 5) return null;
  return { avg: Math.round(inside.reduce((x, y) => x + y, 0) / inside.length), max: Math.max(...inside) };
}
export function ouraSession(w: OuraWorkout, beats: OuraBeat[] = []): Session | null {
  const t0 = Date.parse(w.start_datetime ?? '');
  const t1 = Date.parse(w.end_datetime ?? '');
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || !w.id) return null;
  const hr = beatsIn(beats, t0, t1);
  return {
    ext: String(w.id),
    payload: {
      sport: 'tennis', started_at: iso(t0), ended_at: iso(t1), tz_offset_min: offsetOf(w.start_datetime),
      avg_hr: hr?.avg ?? null, max_hr: hr?.max ?? null, kcal: num(w.calories), device: 'Oura Ring',
    },
  };
}

// ------------------------------------------------------------------- Polar
// GET /v3/exercises (www.polar.com/accesslink-api/#list-exercises)
export type PolarExercise = {
  id: string; start_time?: string; start_time_utc_offset?: number; duration?: string; calories?: number;
  heart_rate?: { average?: number; maximum?: number }; sport?: string; detailed_sport_info?: string; device?: string;
};
export const polarIsTennis = (e: PolarExercise) => lower(e.detailed_sport_info) === 'tennis' || lower(e.sport) === 'tennis';
export function polarSession(e: PolarExercise): Session | null {
  // Polar gives the local time with no zone, and the zone apart, in minutes.
  const off = typeof e.start_time_utc_offset === 'number' && Number.isFinite(e.start_time_utc_offset) ? e.start_time_utc_offset : null;
  const local = Date.parse((e.start_time ?? '').replace(/(Z|[+-]\d{2}:?\d{2})$/i, '') + 'Z');
  const dur = isoDurationMs(e.duration);
  if (!Number.isFinite(local) || dur == null || dur <= 0 || !e.id) return null;
  const t0 = local - (off ?? 0) * 60_000;
  return {
    ext: String(e.id),
    payload: {
      sport: 'tennis', started_at: iso(t0), ended_at: iso(t0 + dur), tz_offset_min: off,
      avg_hr: num(e.heart_rate?.average), max_hr: num(e.heart_rate?.maximum), kcal: num(e.calories),
      device: (typeof e.device === 'string' && e.device.trim()) || 'Polar',
    },
  };
}
