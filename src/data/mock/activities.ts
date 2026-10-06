import { isoDaysAgo } from '@/lib/format';
import type { DetectedActivity, Notification } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's tennis sessions from a tracker (and, since Oct 5, a run from
 * the Watch, waiting with its "Workout detected" row): a WHOOP session that ended an
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
// A morning run this morning (Oct 5: every workout from Apple Health, migration 107), waiting to be logged, with its "Workout detected" row.
const runStart = (() => { const d = new Date(); d.setHours(7, 2, 0, 0); if (d.getTime() > Date.now() - 45 * 60_000) d.setDate(d.getDate() - 1); return d.toISOString(); })();

export const detectedActivities: DetectedActivity[] = [
  {
    id: 'act-demo-run',
    userId: CURRENT_USER_ID,
    source: 'apple-health',
    sport: 'run',
    startedAt: runStart,
    endedAt: new Date(Date.parse(runStart) + 32 * 60_000).toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(),
    minutes: 32,
    distanceM: 5012,
    avgHr: 152,
    maxHr: 171,
    kcal: 341,
    device: 'Watch7,1',
    externalId: 'demo-hk-run',
    status: 'new',
    createdAt: new Date(Date.parse(runStart) + 40 * 60_000).toISOString(),
  },
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

/*
 * The past week on the demo's WHOOP (owner, Oct 5: when someone first
 * connects WHOOP, the past week's workouts show up in Notifications, each
 * one tappable to log): what it hands over when WHOOP is connected again,
 * or when every workout is turned on for it (a run and a gym session come
 * only then). Each one the app does not hold yet gets its own row in
 * Notifications; act-demo-3 (a week ago, logged) is already held, so it
 * never comes back, and neither does any of these once held (a second
 * connect files nothing new).
 */
const daysAgoAt = (days: number, h: number, m: number) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h, m, 0, 0); return d.toISOString(); };
function whoopRow(id: string, sport: string, startedAt: string, minutes: number, more: Partial<DetectedActivity>): DetectedActivity {
  return {
    id, userId: CURRENT_USER_ID, source: 'whoop', sport, startedAt, endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
    tzOffsetMin: -new Date().getTimezoneOffset(), minutes, device: 'WHOOP', externalId: id, status: 'new', createdAt: new Date().toISOString(), ...more,
  };
}
export function whoopWeek(): DetectedActivity[] {
  return [
    whoopRow('act-wk-tennis-2', 'tennis', daysAgoAt(2, 17, 30), 88, { avgHr: 138, maxHr: 169, kcal: 640, strain: 13.8, zones: [12, 20, 26, 22, 8] }),
    whoopRow('act-wk-run-3', 'run', daysAgoAt(3, 7, 15), 41, { avgHr: 155, maxHr: 176, kcal: 452, strain: 12.1, distanceM: 6840 }),
    whoopRow('act-wk-strength-4', 'strength', daysAgoAt(4, 18, 40), 52, { avgHr: 118, maxHr: 151, kcal: 330, strain: 9.4 }),
    whoopRow('act-wk-tennis-6', 'tennis', daysAgoAt(6, 9, 0), 75, { avgHr: 135, maxHr: 166, kcal: 548, strain: 12.9, zones: [15, 19, 22, 15, 4] }),
  ];
}

export const activityNotifications: Notification[] = [
  {
    id: 'n-act-run',
    userId: CURRENT_USER_ID,
    actorId: CURRENT_USER_ID,
    kind: 'activity',
    targetId: 'act-demo-run',
    targetKind: 'activity',
    createdAt: new Date(Date.parse(runStart) + 40 * 60_000).toISOString(),
    read: false,
    preview: 'Run · 32 min · from your Apple Watch', // the server's words (migration 107); the row shows 32m
  },
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

/**
 * The demo's catch-up (owner, Oct 5: "grouped noti"): with `?found=1` on the
 * address (a browser only, kept for the tab), five workouts from the past
 * week that an Apple Watch handed over in one go a few minutes ago, each
 * with its row in Notifications as the server words it, so the one "5
 * workouts found" row and its list (app/workouts-found) can be seen.
 * Nothing without it.
 */
export function demoFoundWorkouts(): { activities: DetectedActivity[]; notifications: Notification[] } | null {
  try {
    if (typeof window === 'undefined' || !window.location || !window.sessionStorage) return null;
    if (new URLSearchParams(window.location.search).get('found') === '1') window.sessionStorage.setItem('courtside-demo-found', '1');
    if (window.sessionStorage.getItem('courtside-demo-found') !== '1') return null;
  } catch {
    return null;
  }
  const tz = -new Date().getTimezoneOffset();
  const at = (daysAgo: number, h: number, m: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; };
  const length = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''}`);
  const list: { sport: string; name: string | null; start: Date; mins: number; distanceM?: number; avgHr: number; maxHr: number; kcal: number }[] = [
    { sport: 'run', name: 'Run', start: at(1, 7, 10), mins: 41, distanceM: 6840, avgHr: 154, maxHr: 176, kcal: 452 },
    { sport: 'strength', name: 'Strength training', start: at(2, 12, 30), mins: 48, avgHr: 118, maxHr: 149, kcal: 286 },
    { sport: 'tennis', name: null, start: at(3, 17, 30), mins: 75, avgHr: 138, maxHr: 167, kcal: 598 },
    { sport: 'walk', name: 'Walk', start: at(4, 8, 0), mins: 35, distanceM: 2930, avgHr: 102, maxHr: 121, kcal: 151 },
    { sport: 'ride', name: 'Bike ride', start: at(5, 9, 15), mins: 62, distanceM: 21400, avgHr: 131, maxHr: 158, kcal: 540 },
  ];
  // Handed over one after another, a few seconds apart, six minutes ago.
  const filed = Date.now() - 6 * 60_000;
  const activities: DetectedActivity[] = list.map((w, i) => ({
    id: `act-demo-found-${i + 1}`,
    userId: CURRENT_USER_ID,
    source: 'apple-health',
    sport: w.sport,
    startedAt: w.start.toISOString(),
    endedAt: new Date(w.start.getTime() + w.mins * 60_000).toISOString(),
    tzOffsetMin: tz,
    minutes: w.mins,
    ...(w.distanceM ? { distanceM: w.distanceM } : {}),
    avgHr: w.avgHr,
    maxHr: w.maxHr,
    kcal: w.kcal,
    device: 'Watch7,1',
    externalId: `demo-hk-found-${i + 1}`,
    status: 'new',
    createdAt: new Date(filed + i * 2000).toISOString(),
  }));
  // The server's words (migration 107): found long after it ended, so the weekday too.
  const notifications: Notification[] = list.map((w, i) => ({
    id: `n-act-found-${i + 1}`,
    userId: CURRENT_USER_ID,
    actorId: CURRENT_USER_ID,
    kind: 'activity',
    targetId: `act-demo-found-${i + 1}`,
    targetKind: 'activity',
    createdAt: new Date(filed + i * 2000).toISOString(),
    read: false,
    preview: [w.name, w.start.toLocaleDateString('en-US', { weekday: 'short' }), length(w.mins)].filter(Boolean).join(' · ') + ' · from your Apple Watch',
  }));
  return { activities, notifications };
}
