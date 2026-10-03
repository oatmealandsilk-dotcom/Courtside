// Fitbit, Oura and Polar workouts, and what of each CourtSide keeps. Pure,
// so Node can test it too. Every tracker's tennis session becomes the same
// payload WHOOP's does (record_activity, migrations 58 and 69).

export type ProviderId = 'fitbit' | 'oura' | 'polar';
export const PROVIDERS: ProviderId[] = ['fitbit', 'oura', 'polar'];
export const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && (PROVIDERS as string[]).includes(p);

/** What record_activity checks and stores. Missing numbers are null; nothing else is sent. */
export type Payload = {
  sport: 'tennis'; started_at: string; ended_at: string; tz_offset_min: number | null;
  avg_hr: number | null; max_hr: number | null; kcal: number | null; device: string;
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
// GET /1/user/-/activities/list.json (dev.fitbit.com/build/reference/web-api/activity/get-activity-log-list)
export type FitbitActivity = {
  logId: number | string; activityName?: string; activityTypeId?: number; startTime?: string;
  duration?: number; averageHeartRate?: number; calories?: number; source?: { name?: string };
};
/** Fitbit's own "Tennis" (activity type 15675 in Fitbit's list). Never table tennis, paddle tennis, padel or pickleball. */
export const FITBIT_TENNIS = 15675;
export const fitbitIsTennis = (a: FitbitActivity) => lower(a.activityName) === 'tennis' || a.activityTypeId === FITBIT_TENNIS;
export function fitbitSession(a: FitbitActivity): Session | null {
  const t0 = Date.parse(a.startTime ?? '');
  const dur = typeof a.duration === 'number' ? a.duration : NaN;
  if (!Number.isFinite(t0) || !(dur > 0) || a.logId == null) return null;
  return {
    ext: String(a.logId),
    payload: {
      sport: 'tennis', started_at: iso(t0), ended_at: iso(t0 + dur), tz_offset_min: offsetOf(a.startTime),
      // Fitbit gives the average only; its zones are ranges, not the highest beat.
      avg_hr: num(a.averageHeartRate), max_hr: null, kcal: num(a.calories),
      device: (typeof a.source?.name === 'string' && a.source.name.trim()) || 'Fitbit',
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
