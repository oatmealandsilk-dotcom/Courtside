import { isoDaysAgo } from '@/lib/format';
import { localDay } from '@/features/practice/stats';
import type { Notification, PracticeSession, SessionTag } from '../types';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's own log (?as=you), three weeks of it, so "Your sessions", the
 * "Add session stats" picker and the profile's streak have something real
 * to show: matches won and lost, practice, drills, a gym day, one logged
 * from an Apple Watch (act-demo-2) and one already on a post (p-demo-drills).
 * Only the demo has these: with a database, your log comes from migration 39.
 *
 * And the people in it (migration 62): yesterday's match has Mira tagged,
 * and she accepted, so its post says "Won vs @miraplays"; so did the match
 * three days ago, not posted yet; June hasn't answered for last week's loss
 * ("vs June · Waiting"); Sam tagged you in a match and is waiting on you
 * (an alert, and the top of Your sessions); and Mira tagged you in a
 * practice you accepted, so it is in your log and on your Tagged tab.
 */

const dayAgo = (n: number) => localDay(Date.now() - n * 86_400_000);
/** When it was logged: that evening (or morning), n days ago. */
const loggedAt = (n: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 10, 0, 0); return d.toISOString(); };

export const demoSessions: PracticeSession[] = [
  { id: 'ses-demo-1', userId: CURRENT_USER_ID, day: dayAgo(1), minutes: 90, kind: 'match', won: true, note: 'At Alder Park', createdAt: loggedAt(1, 20) },
  { id: 'ses-demo-2', userId: CURRENT_USER_ID, day: dayAgo(2), minutes: 62, kind: 'practice', activityId: 'act-demo-2', createdAt: loggedAt(2, 19) },
  { id: 'ses-demo-10', userId: CURRENT_USER_ID, day: dayAgo(3), minutes: 75, kind: 'match', won: true, note: 'At Alder Park', createdAt: loggedAt(3, 19) },
  { id: 'ses-demo-3', userId: CURRENT_USER_ID, day: dayAgo(4), minutes: 45, kind: 'drills', createdAt: loggedAt(4, 8) },
  // Mira's practice, from her tag: accepted with "Add to my sessions".
  { id: 'ses-demo-11', userId: CURRENT_USER_ID, day: dayAgo(5), minutes: 60, kind: 'practice', opponent: 'Mira', fromSessionId: 'ses-mira-1', createdAt: isoDaysAgo(4, 2) },
  { id: 'ses-demo-4', userId: CURRENT_USER_ID, day: dayAgo(6), minutes: 75, kind: 'practice', note: 'At Cypress Hollow Park · with Dev', createdAt: loggedAt(6, 18) },
  // A week ago from WHOOP (act-demo-3), a match won against Mira: on your post p-demo-whoop.
  { id: 'ses-demo-13', userId: CURRENT_USER_ID, day: dayAgo(7), minutes: 96, kind: 'match', won: true, activityId: 'act-demo-3', createdAt: loggedAt(7, 20) },
  { id: 'ses-demo-5', userId: CURRENT_USER_ID, day: dayAgo(8), minutes: 50, kind: 'fitness', createdAt: loggedAt(8, 7) },
  { id: 'ses-demo-6', userId: CURRENT_USER_ID, day: dayAgo(9), minutes: 120, kind: 'match', won: false, createdAt: loggedAt(9, 12) },
  { id: 'ses-demo-7', userId: CURRENT_USER_ID, day: dayAgo(12), minutes: 60, kind: 'practice', createdAt: loggedAt(12, 18) },
  { id: 'ses-demo-8', userId: CURRENT_USER_ID, day: dayAgo(16), minutes: 90, kind: 'practice', createdAt: loggedAt(16, 18) },
  { id: 'ses-demo-9', userId: CURRENT_USER_ID, day: dayAgo(20), minutes: 60, kind: 'match', won: true, opponent: 'Priya', createdAt: loggedAt(20, 11) },
];

/**
 * The demo's tags, as my_session_tags() would return them to you: the ones
 * you made (your result) and the ones of you (the result from your side).
 */
export const demoSessionTags: SessionTag[] = [
  { id: 'stag-demo-1', sessionId: 'ses-demo-1', taggerId: CURRENT_USER_ID, taggedId: 'u-mira', role: 'opponent', status: 'accepted', createdAt: loggedAt(1, 20), respondedAt: isoDaysAgo(0, 11), kind: 'match', day: dayAgo(1), minutes: 90, won: true },
  { id: 'stag-demo-10', sessionId: 'ses-demo-10', taggerId: CURRENT_USER_ID, taggedId: 'u-mira', role: 'opponent', status: 'accepted', createdAt: loggedAt(3, 19), respondedAt: isoDaysAgo(2, 4), kind: 'match', day: dayAgo(3), minutes: 75, won: true },
  { id: 'stag-demo-13', sessionId: 'ses-demo-13', taggerId: CURRENT_USER_ID, taggedId: 'u-mira', role: 'opponent', status: 'accepted', createdAt: loggedAt(7, 20), respondedAt: isoDaysAgo(6, 4), kind: 'match', day: dayAgo(7), minutes: 96, won: true },
  { id: 'stag-demo-6', sessionId: 'ses-demo-6', taggerId: CURRENT_USER_ID, taggedId: 'u-june', role: 'opponent', status: 'pending', createdAt: loggedAt(9, 12), kind: 'match', day: dayAgo(9), minutes: 120, won: false },
  // Sam lost to you two days ago: Sam's session, so the result is from your side.
  { id: 'stag-demo-sam', sessionId: 'ses-sam-1', taggerId: 'u-sam', taggedId: CURRENT_USER_ID, role: 'opponent', status: 'pending', createdAt: isoDaysAgo(0, 2), kind: 'match', day: dayAgo(2), minutes: 75, won: true },
  { id: 'stag-demo-mira', sessionId: 'ses-mira-1', taggerId: 'u-mira', taggedId: CURRENT_USER_ID, role: 'partner', status: 'accepted', mirroredSessionId: 'ses-demo-11', createdAt: isoDaysAgo(4, 5), respondedAt: isoDaysAgo(4, 2), kind: 'practice', day: dayAgo(5), minutes: 60 },
];

/** Sam's tag, in your alerts. Its target is Sam's session; the words are "tagged you in a match". */
export const demoSessionTagNotifications: Notification[] = [
  { id: 'n-stag-sam', userId: CURRENT_USER_ID, actorId: 'u-sam', kind: 'session-tag', targetId: 'ses-sam-1', targetKind: 'session-tag', createdAt: isoDaysAgo(0, 2), read: false, preview: 'match' },
  { id: 'n-stag-mira', userId: CURRENT_USER_ID, actorId: 'u-mira', kind: 'session-tag', targetId: 'ses-mira-1', targetKind: 'session-tag', createdAt: isoDaysAgo(4, 5), read: true, preview: 'practice' },
];
