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
 *
 * The WHOOP sessions carry their heart-rate zones (migration 65): minutes
 * in zones 1–5, easiest first. The Apple Watch one has none (Apple gives
 * no zone times). act-demo-3, a week ago, is logged (ses-demo-13) and on
 * your post p-demo-whoop, so its stats sheet shows the "Only you" box.
 */

const startedAt = isoDaysAgo(0, 3);
const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(18, 12, 0, 0); return d.toISOString(); })();
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
    zones: [14, 18, 25, 21, 6],
    status: 'new',
    createdAt: isoDaysAgo(0, 1),
  },
  {
    id: 'act-demo-3',
    userId: CURRENT_USER_ID,
    source: 'whoop',
    sport: 'tennis',
    startedAt: weekStart,
    endedAt: new Date(Date.parse(weekStart) + 96 * 60_000).toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(),
    minutes: 96,
    avgHr: 146,
    maxHr: 174,
    kcal: 702,
    strain: 15.1,
    device: 'WHOOP',
    zones: [10, 16, 28, 30, 12],
    status: 'logged',
    sessionId: 'ses-demo-13',
    createdAt: weekStart,
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
    preview: '1 hr 24 min · from your WHOOP', // the server's words; the row shows 1h 24m
  },
];
