import { MUTED_FOREVER } from './groupRules';

/**
 * How long a chat can be muted for, the four lengths Instagram and WhatsApp
 * offer. `ms` null is "until I turn it back on".
 */
export const MUTE_CHOICES: { key: string; label: string; ms: number | null }[] = [
  { key: '1h', label: 'For 1 hour', ms: 60 * 60_000 },
  { key: '8h', label: 'For 8 hours', ms: 8 * 60 * 60_000 },
  { key: '1w', label: 'For 1 week', ms: 7 * 24 * 60 * 60_000 },
  { key: 'forever', label: 'Until I turn it back on', ms: null },
];

/** The moment a mute picked now runs out: MUTED_FOREVER for "until I turn it back on". */
export const muteUntil = (ms: number | null) => (ms === null ? MUTED_FOREVER : new Date(Date.now() + ms).toISOString());

const DAY = 86_400_000;
const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The line under "Mute messages": "Muted until 6:00 PM", "Muted until
 * tomorrow, 9:00 AM", "Muted until Sat 6:00 PM", or just "Muted" when it
 * lasts until you turn it back on. Empty when the chat is not muted.
 */
export function mutedLabel(until: string | undefined, now = new Date()): string {
  if (!until) return '';
  const at = Date.parse(until);
  if (!Number.isFinite(at) || at <= now.getTime()) return '';
  // Anything past the year 9000 is the "forever" mark, however the server spelled it.
  if (at >= Date.parse('9000-01-01T00:00:00Z')) return 'Muted';
  const d = new Date(at);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const days = Math.floor((at - today.getTime()) / DAY);
  if (days === 0) return `Muted until ${time(d)}`;
  if (days === 1) return `Muted until tomorrow, ${time(d)}`;
  if (days < 7) return `Muted until ${d.toLocaleDateString([], { weekday: 'short' })} ${time(d)}`;
  return `Muted until ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
