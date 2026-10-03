/**
 * What a counting number shows: a whole number; the hours of a duration
 * (counted on their own, never shown as 0: "1h" from the first frame); the
 * minutes after the hours, as two figures ("07"); or one decimal place.
 */
export type CountPart = 'int' | 'hours' | 'minutes2' | 'dec1';

/** The number as it reads at `v` on its way up. A worklet, so a phone can run it on the UI thread. */
export function countText(v: number, part: CountPart): string {
  'worklet';
  if (part === 'dec1') return (Math.round(v * 10) / 10).toFixed(1);
  const n = Math.max(0, Math.round(v));
  if (part === 'hours') return String(Math.max(1, n));
  if (part === 'minutes2') { const m = Math.min(59, n); return m < 10 ? `0${m}` : String(m); }
  return String(n);
}
