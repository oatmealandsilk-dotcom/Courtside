import type { User } from '@/data/types';

/** Up for a hit right now: they said so, and the time they said has not passed. */
export const isOpenToHit = (user: Pick<User, 'openToHitUntil'> | null | undefined) =>
  !!user?.openToHitUntil && Date.parse(user.openToHitUntil) > Date.now();

/** The end of today, where the phone is: one tap on your ring lasts the day, the way a status should. */
export function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

/** Today at this hour (and minutes), where the phone is. */
export function todayAt(hour: number, minutes = 0): Date {
  const d = new Date();
  d.setHours(hour, minutes, 0, 0);
  return d;
}

/**
 * The distances you can pick in the hold-to-edit sheet (migration 120 takes
 * exactly these). Anything else, or none, is any distance.
 */
export const HIT_MILES = [5, 10, 25] as const;
export const asHitMiles = (v: unknown): number | undefined => (typeof v === 'number' && (HIT_MILES as readonly number[]).includes(v) ? v : undefined);

/**
 * The moment, rounded up to the next whole minute: how a time is said. A
 * one-tap ring ends at 11:59:59pm where it was set, so it reads as midnight
 * there and as the matching hour anywhere else ("till 9pm" for a New York
 * friend's midnight, seen from Los Angeles), never "till 8:59pm".
 */
export function onTheMinute(at: Date | number | string): Date {
  const t = typeof at === 'string' ? Date.parse(at) : typeof at === 'number' ? at : at.getTime();
  return new Date(Math.ceil(t / 60_000) * 60_000);
}

/** Whether this moment (already on the minute) is 12am, where the phone is: the one-tap end of today, or 12am itself. */
const isMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0;

/** "8pm", "8:30pm", "noon" or "midnight": a clock time the way people say it. */
export function clockWords(at: Date): string {
  const d = onTheMinute(at);
  if (isMidnight(d)) return 'midnight';
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 12 && m === 0) return 'noon';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Until when someone is open, as the ring's line says it (Oct 5, owner):
 * "till 8pm", "till midnight", never "4h". Null when there is no time, or it has passed.
 */
export function tillLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at) || at <= Date.now()) return null;
  const d = onTheMinute(at);
  // Past midnight into the small hours reads plainly ("till 1am"); tomorrow's daytime says so.
  const tomorrow = d.toDateString() !== new Date().toDateString() && !isMidnight(d) && d.getHours() >= 6;
  return `till ${clockWords(d)}${tomorrow ? ' tomorrow' : ''}`;
}

/** The later of two "open until" times (a profile's and the map's), or whichever there is. */
export function laterUntil(a: string | null | undefined, b: string | null | undefined): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Someone open to hit who'd rather stay within a distance, seen from farther
 * than that (Oct 5, owner: "Instead of ask anyway, maybe say something less
 * discouraging. Because many times ppl can arrange stuff."): one friendly
 * line, never a warning. "Robert usually hits within 10 mi of Raleigh.
 * Suggest a court that works for you both." `town`: the area the app already
 * shows for them (never a spot). Null when they are within it, chose any
 * distance, are not open, or how far they are is not known.
 */
export function hitsWithinLine(user: Pick<User, 'name' | 'openToHitMiles' | 'openToHitUntil'>, milesAway: number | null | undefined, town?: string | null): string | null {
  const within = asHitMiles(user.openToHitMiles);
  if (!within || milesAway == null || !Number.isFinite(milesAway) || milesAway <= within || !isOpenToHit(user)) return null;
  const first = user.name.split(' ')[0] || user.name;
  const area = (town ?? '').split(',')[0].trim();
  return `${first} usually hits within ${within} mi${area ? ` of ${area}` : ''}. Suggest a court that works for you both.`;
}
