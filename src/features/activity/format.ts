import type { DetectedActivity, SessionDetail, StatsSource } from '@/data/types';
import { localDay } from '@/features/practice/stats';
import { duration } from '@/lib/format';

/*
 * How a tracker's tennis session is put into words: its name, its day, its
 * times, where it came from, and the private line of numbers only its owner
 * sees. Plain functions, so the store and the screens say it the same way.
 */

/** The part of the day a session started in, on this phone's clock. */
export function timeOfDay(iso: string): string {
  const h = new Date(iso).getHours();
  if (h < 8) return 'Early morning';
  if (h < 12) return 'Morning';
  if (h < 14) return 'Lunchtime';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

/** "Evening tennis". */
export const activityTitle = (a: DetectedActivity) => `${timeOfDay(a.startedAt)} tennis`;

/** The calendar day it was played where it was played, when the tracker said where; otherwise on this phone's clock. */
export function activityDay(a: DetectedActivity): string {
  if (a.tzOffsetMin != null) return new Date(Date.parse(a.startedAt) + a.tzOffsetMin * 60000).toISOString().slice(0, 10);
  return localDay(a.startedAt);
}

/** "6:12 PM" → "6:12" and "pm", so a range can say "pm" once. A 24-hour clock has no mark. */
function clock(at: Date): { time: string; mark: string } {
  const s = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const m = /^(.*?)[\s ]*([AaPp][.]?[Mm][.]?)$/.exec(s);
  return m ? { time: m[1], mark: m[2].replace(/[.]/g, '').toLowerCase() } : { time: s, mark: '' };
}

/** "Today, 6:12–7:36 pm", "Yesterday, …" or "Mon Sep 29, …". */
export function activityWhen(a: DetectedActivity, now = new Date()): string {
  const start = new Date(a.startedAt);
  const from = clock(start);
  const to = clock(new Date(a.endedAt));
  const range = from.mark === to.mark
    ? `${from.time}–${to.time}${to.mark ? ` ${to.mark}` : ''}`
    : `${from.time} ${from.mark}–${to.time} ${to.mark}`;
  const day = localDay(start);
  const label = day === localDay(now) ? 'Today'
    : day === localDay(now.getTime() - 86_400_000) ? 'Yesterday'
    // The locale's own order, without its commas, so the one comma left is the one before the times.
    : start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
  return `${label}, ${range}`;
}

/** Which label a session's numbers carry: an Apple Watch only when the workout says it was saved by one. */
export function statsSourceOf(a: DetectedActivity): StatsSource {
  if (a.source === 'whoop') return 'whoop';
  if (a.source === 'apple-health') return /^Watch[0-9]+,[0-9]+$/.test(a.device ?? '') ? 'apple-watch' : 'apple-health';
  return 'health-connect';
}

/**
 * Where a post's numbers came from, in words only, never a logo: WHOOP's
 * own attribution wording, and "From …" for Apple's, so it reads as the
 * source rather than a device tag.
 */
export function sourceLabel(s: StatsSource): string {
  switch (s) {
    case 'whoop': return 'Data by WHOOP';
    case 'apple-watch': return 'From Apple Watch';
    case 'apple-health': return 'From Apple Health';
    default: return 'From Health Connect';
  }
}

/** "From your WHOOP", "from your Apple Watch". */
export function fromWho(a: DetectedActivity): string {
  switch (statsSourceOf(a)) {
    case 'whoop': return 'your WHOOP';
    case 'apple-watch': return 'your Apple Watch';
    case 'apple-health': return 'Apple Health';
    default: return 'your tracker';
  }
}

/** "171 max bpm · 141 avg · 612 kcal · Strain 14.2": what only the player sees. Missing numbers are left out; Strain is WHOOP's alone. */
export function privateLine(a: DetectedActivity): string {
  return [
    a.maxHr ? `${a.maxHr} max bpm` : null,
    a.avgHr ? `${a.avgHr} avg` : null,
    a.kcal ? `${a.kcal} kcal` : null,
    a.source === 'whoop' && a.strain != null ? `Strain ${a.strain.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * The stats a post carries from a tracker session: time on court always,
 * heart rate only when the author switched it on and is a confirmed adult.
 * It is the same shape the server rebuilds from the private record
 * (fill_post_session_stats, migration 58), so the copy shown straight away
 * matches what is saved. Sending maxHr is how the post asks for heart rate.
 */
export function sessionFromActivity(a: DetectedActivity, showHr: boolean, adult: boolean): SessionDetail {
  return {
    focus: 'Tennis',
    minutes: a.minutes,
    drills: [],
    activityId: a.id,
    source: statsSourceOf(a),
    ...(showHr && adult && a.maxHr ? { maxHr: a.maxHr, ...(a.avgHr ? { avgHr: a.avgHr } : {}) } : {}),
  };
}

/** "1h 24m · 171 max bpm · Data by WHOOP": a post's stats in one line of words. */
export function statsLine(s: SessionDetail): string {
  return [duration(s.minutes), s.maxHr ? `${s.maxHr} max bpm` : null, sourceLabel(s.source ?? 'apple-health')].filter(Boolean).join(' · ');
}
