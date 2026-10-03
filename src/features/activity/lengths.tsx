import React from 'react';

import { Duration, Figure } from '@/components/session/Duration';
import type { DetectedActivity } from '@/data/types';
import { statsSourceOf } from '@/features/activity/format';
import { duration } from '@/lib/format';
import { colors } from '@/theme';

/** The usual lengths a session is logged at, in minutes. */
export const LENGTHS = [30, 60, 90, 120];

export const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}½ hr` : `${m / 60} hr`);

/** A length as the rest of the app writes it: "30m", "1h", "1h 30m", "2h", big figures with small units. */
export const lengthTile = (m: number) => ({
  value: m, top: '', main: duration(m), label: lengthLabel(m),
  draw: (on: boolean) => (m >= 60 && m % 60
    ? <Duration minutes={m} size={22} color={on ? colors.bg : colors.text} unitColor={on ? colors.bg : colors.textMuted} />
    : <Figure value={m < 60 ? m : m / 60} unit={m < 60 ? 'm' : 'h'} size={22} unitScale={0.4} color={on ? colors.bg : colors.text} unitColor={on ? colors.bg : colors.textMuted} />),
});

/** The tracker's short name, as on its "from WHOOP" line and "Use WHOOP's time". */
export function trackerName(a: DetectedActivity) {
  return ({ whoop: 'WHOOP', 'apple-watch': 'Watch', fitbit: 'Fitbit', oura: 'Oura', polar: 'Polar' } as Partial<Record<ReturnType<typeof statsSourceOf>, string>>)[statsSourceOf(a)] ?? 'Health';
}
