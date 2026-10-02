import { isoDaysAgo } from '@/lib/format';
import type { DetectedActivity, Notification } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's tennis sessions from a tracker: a WHOOP session that ended an
 * hour and a half ago, not logged yet, with its "Tennis detected" row in
 * Notifications, so the whole flow can be seen in the web demo (?as=you);
 * and an Apple Watch session from two days ago, already logged (ses-demo-2),
 * ready to post. Only the demo has these: with a database, sessions come
 * from migration 58.
 */

const startedAt = isoDaysAgo(0, 3);
const watchStart = (() => { const d = new Date(); d.setDate(d.getDate() - 2); d.setHours(18, 4, 0, 0); return d.toISOString(); })();

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
  {
    id: 'act-demo-2',
    userId: CURRENT_USER_ID,
    source: 'apple-health',
    sport: 'tennis',
    startedAt: watchStart,
    endedAt: new Date(Date.parse(watchStart) + 62 * 60_000).toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(),
    minutes: 62,
    avgHr: 132,
    maxHr: 158,
    kcal: 455,
    device: 'Watch7,1',
    status: 'logged',
    sessionId: 'ses-demo-2',
    createdAt: watchStart,
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
