import { localDay } from '@/features/practice/stats';
import type { PracticeSession } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's own log (?as=you), three weeks of it, so "Your sessions", the
 * "Add session stats" picker and the profile's streak have something real
 * to show: matches won and lost, practice, drills, a gym day, one logged
 * from an Apple Watch (act-demo-2) and one already on a post (p-demo-drills).
 * Only the demo has these: with a database, your log comes from migration 39.
 */

const dayAgo = (n: number) => localDay(Date.now() - n * 86_400_000);
/** When it was logged: that evening (or morning), n days ago. */
const loggedAt = (n: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 10, 0, 0); return d.toISOString(); };

export const demoSessions: PracticeSession[] = [
  { id: 'ses-demo-1', userId: CURRENT_USER_ID, day: dayAgo(1), minutes: 90, kind: 'match', won: true, opponent: 'Sam', note: 'At Alder Park', createdAt: loggedAt(1, 20) },
  { id: 'ses-demo-2', userId: CURRENT_USER_ID, day: dayAgo(2), minutes: 62, kind: 'practice', activityId: 'act-demo-2', createdAt: loggedAt(2, 19) },
  { id: 'ses-demo-3', userId: CURRENT_USER_ID, day: dayAgo(4), minutes: 45, kind: 'drills', createdAt: loggedAt(4, 8) },
  { id: 'ses-demo-4', userId: CURRENT_USER_ID, day: dayAgo(6), minutes: 75, kind: 'practice', note: 'At Cypress Hollow Park · with Dev', createdAt: loggedAt(6, 18) },
  { id: 'ses-demo-5', userId: CURRENT_USER_ID, day: dayAgo(8), minutes: 50, kind: 'fitness', createdAt: loggedAt(8, 7) },
  { id: 'ses-demo-6', userId: CURRENT_USER_ID, day: dayAgo(9), minutes: 120, kind: 'match', won: false, opponent: 'Priya', createdAt: loggedAt(9, 12) },
  { id: 'ses-demo-7', userId: CURRENT_USER_ID, day: dayAgo(12), minutes: 60, kind: 'practice', createdAt: loggedAt(12, 18) },
  { id: 'ses-demo-8', userId: CURRENT_USER_ID, day: dayAgo(16), minutes: 90, kind: 'practice', createdAt: loggedAt(16, 18) },
  { id: 'ses-demo-9', userId: CURRENT_USER_ID, day: dayAgo(20), minutes: 60, kind: 'match', won: true, createdAt: loggedAt(20, 11) },
];
