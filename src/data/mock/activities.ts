import { isoDaysAgo } from '@/lib/format';
import type { DetectedActivity, Notification } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's one tennis session from a tracker: a WHOOP session that ended
 * an hour and a half ago, not logged yet, with its "Tennis detected" row in
 * Notifications, so the whole flow can be seen in the web demo (?as=you).
 * Only the demo has these: with a database, sessions come from migration 58.
 */

const startedAt = isoDaysAgo(0, 3);

export const detectedActivities: DetectedActivity[] = [
  {
    id: 'act-demo-1',
    userId: CURRENT_USER_ID,
    source: 'whoop',
    sport: 'tennis',
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 84 * 60_000).toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(),
    minutes: 84,
    avgHr: 141,
    maxHr: 171,
    kcal: 612,
    strain: 14.2,
    device: 'WHOOP',
    status: 'new',
    createdAt: isoDaysAgo(0, 1),
  },
];

export const activityNotifications: Notification[] = [
  {
    id: 'n-act-1',
    userId: CURRENT_USER_ID,
    actorId: CURRENT_USER_ID,
    kind: 'activity',
    targetId: 'act-demo-1',
    targetKind: 'activity',
    createdAt: isoDaysAgo(0, 1),
    read: false,
    preview: '1 hr 24 min · from your WHOOP',
  },
];
