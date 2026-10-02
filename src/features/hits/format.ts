import type { HitRequest } from '@/data/types';

const DAY = 86_400_000;
const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Today 6:30 PM", "Tomorrow 9:00 AM", "Sat 9:00 AM", or a date further out. */
export function hitWhen(startsAt: string, now = new Date()): string {
  const d = new Date(startsAt);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / DAY);
  if (days === 0) return `Today ${time(d)}`;
  if (days === 1) return `Tomorrow ${time(d)}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time(d)}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time(d)}`;
}

export const FORMAT_LABEL: Record<HitRequest['format'], string> = { singles: 'Singles', doubles: 'Doubles', hit: 'Just hitting' };

export function levelText(h: Pick<HitRequest, 'levelMin' | 'levelMax'>): string {
  if (h.levelMin === undefined && h.levelMax === undefined) return 'Any level';
  if (h.levelMin !== undefined && h.levelMax !== undefined) return `${h.levelMin.toFixed(1)}–${h.levelMax.toFixed(1)}`;
  return h.levelMin !== undefined ? `${h.levelMin.toFixed(1)}+` : `Up to ${h.levelMax!.toFixed(1)}`;
}

/** "6pm" or "6:30pm": as short as a pin or a badge wants. */
const shortTime = (d: Date) => {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() < 12 ? 'am' : 'pm'}`;
};

/** "Today 6pm", "Tomorrow 9am", "Sat 9am", or "Oct 9 9am" further out: for a map flag, a badge, a one-line row. */
export function hitShort(startsAt: string, now = new Date()): string {
  const d = new Date(startsAt);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / DAY);
  if (days === 0) return `Today ${shortTime(d)}`;
  if (days === 1) return `Tomorrow ${shortTime(d)}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${shortTime(d)}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${shortTime(d)}`;
}
