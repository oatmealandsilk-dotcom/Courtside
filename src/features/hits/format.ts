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
