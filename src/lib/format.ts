export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  // Past a day, the date says more than "3d" does; the year only when it differs.
  const when = new Date(iso);
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * When something was posted, in words, the way Reels and TikTok say it under
 * an opened caption: "Just now", "24 minutes ago", "2 hours ago", "3 days
 * ago", and past a week the date ("Sep 21"; the year only when it differs).
 */
export function agoInWords(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'Just now';
  if (hours < 1) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  if (days < 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const when = new Date(iso);
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Just the clock time a message was sent, "9:41 AM", in the phone's own 12-
 * or 24-hour style. A chat asks this for every message each time it draws,
 * so the formatter is made once and kept, until the phone's clock moves to
 * another time zone (flying to a tournament, or the clocks going forward):
 * a formatter stays in the zone it was made in, so then it is made afresh,
 * and these times keep agreeing with the chat's day lines.
 */
let clockFormat: { format: Intl.DateTimeFormat; offset: number } | null = null;
export function chatTime(iso: string): string {
  try {
    const offset = new Date().getTimezoneOffset();
    if (!clockFormat || clockFormat.offset !== offset) {
      clockFormat = { format: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }), offset };
    }
    return clockFormat.format.format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

/** A time line in a chat: "Today 2:14 PM", "Yesterday 9:03 AM", "Mon 4:20 PM" this week, else the date and time. */
export function chatStamp(iso: string, now: Date = new Date()): string {
  const { day, time } = chatStampParts(iso, now);
  return /\d/.test(day) ? `${day}, ${time}` : `${day} ${time}`;
}

/** A chat's time line in its two parts, the day ("Today", "Mon", "Sep 25") and the time ("2:14 PM"), for the day to be set a little stronger. */
export function chatStampParts(iso: string, now: Date = new Date()): { day: string; time: string } {
  const when = new Date(iso);
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(when)) / 86_400_000);
  if (days === 0) return { day: 'Today', time };
  if (days === 1) return { day: 'Yesterday', time };
  if (days < 7) return { day: when.toLocaleDateString(undefined, { weekday: 'short' }), time };
  const sameYear = when.getFullYear() === now.getFullYear();
  return { day: when.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }), time };
}

export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function isoDaysAgo(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

export function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** How long a hit has left on the rail: "23h left", "40m left", or "ending" in its last minute. */
export function timeLeft(expiresIso: string, now: Date = new Date()): string {
  const diff = new Date(expiresIso).getTime() - now.getTime();
  if (diff <= 60_000) return 'ending';
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}m left`;
  return `${Math.ceil(diff / 3_600_000)}h left`;
}

/**
 * Years playing, as the setup quiz asked it: a range, not a number. The quiz
 * stores each range as one number (under 1 → 0, 1–3 → 2, 4–9 → 6, 10+ → 12),
 * so those read back as the range picked; any other number is shown as is.
 */
export function experienceLabel(years: number): string {
  if (years === 0) return 'Under a year';
  if (years === 2) return '1–3 years';
  if (years === 6) return '4–9 years';
  if (years === 12) return '10+ years';
  return years === 1 ? '1 year' : `${years} years`;
}

/** Hours as hours and minutes, never a decimal: 5.6 → "5h 36m", 0.75 → "45m", 8 → "8h". */
export function hoursAndMinutes(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
