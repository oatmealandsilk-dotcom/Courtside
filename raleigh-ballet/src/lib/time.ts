/**
 * All dates and times are shown and reasoned about in the studio's timezone,
 * whatever timezone the server or the visitor's phone is in.
 */
export const STUDIO_TZ = "America/New_York";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock date/time in the studio for an instant. */
export function zoned(d: Date): ZonedParts {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** The instant at which the studio's wall clock shows the given date and time. */
export function studioTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess;
  // Correct for the zone offset (twice, to settle across daylight-saving changes).
  for (let i = 0; i < 2; i++) {
    const z = zoned(new Date(t));
    const shown = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
    t += guess - shown;
  }
  return new Date(t);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-12-03" for an instant, in studio time. */
export function dateKey(d: Date): string {
  const z = zoned(d);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}
export function monthKey(d: Date): string {
  return dateKey(d).slice(0, 7);
}
export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day: day || 1 };
}
/** Start of a studio day (midnight studio time) from "YYYY-MM-DD". */
export function startOfDay(key: string): Date {
  const { year, month, day } = parseDateKey(key);
  return studioTime(year, month, day);
}
export function addDaysKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** [start, end) instants for a "YYYY-MM" month in studio time. */
export function monthRange(month: string): { start: Date; end: Date } {
  const { year, month: m } = parseDateKey(month + "-01");
  return { start: studioTime(year, m, 1), end: studioTime(m === 12 ? year + 1 : year, m === 12 ? 1 : m + 1, 1) };
}
export function addMonths(month: string, n: number): string {
  const { year, month: m } = parseDateKey(month + "-01");
  const d = new Date(Date.UTC(year, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function daysInMonth(month: string): number {
  const { year, month: m } = parseDateKey(month + "-01");
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}
export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, ...opts });
const fDate = f({ weekday: "short", month: "short", day: "numeric" });
const fDateLong = f({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fDateShort = f({ month: "short", day: "numeric", year: "numeric" });
const fTime = f({ hour: "numeric", minute: "2-digit" });
const fMonth = f({ month: "long", year: "numeric" });

export const fmtDate = (d: Date) => fDate.format(d);
export const fmtDateLong = (d: Date) => fDateLong.format(d);
export const fmtDateShort = (d: Date) => fDateShort.format(d);
export const fmtTime = (d: Date) => fTime.format(d).replace(":00", "").toLowerCase().replace(" ", "");
export const fmtDateTime = (d: Date) => `${fmtDate(d)}, ${fmtTime(d)}`;
export const fmtTimeRange = (a: Date, b: Date) => `${fmtTime(a)}–${fmtTime(b)}`;
export const fmtMonth = (month: string) => fMonth.format(studioTime(+month.slice(0, 4), +month.slice(5, 7), 15, 12));
export const fmtDateKey = (key: string) => fDateShort.format(studioTime(...(Object.values(parseDateKey(key)) as [number, number, number]), 12));

/** Value for <input type="datetime-local"> in studio time, and back. */
export function toLocalInput(d: Date): string {
  const z = zoned(d);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}T${pad(z.hour)}:${pad(z.minute)}`;
}
export function fromLocalInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return studioTime(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

export function ageOn(dob: string, on: Date = new Date()): number {
  const b = parseDateKey(dob);
  const z = zoned(on);
  let age = z.year - b.year;
  if (z.month < b.month || (z.month === b.month && z.day < b.day)) age--;
  return age;
}
export const hoursMs = (h: number) => h * 3600_000;
export const daysMs = (d: number) => d * 86400_000;
