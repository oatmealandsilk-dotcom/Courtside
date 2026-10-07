import type { Conversation, HitRequest, Message, Notification } from '../types';
import { DEMO_PARK } from './courts';
import { CURRENT_USER_ID } from './users';

const hoursFromNow = (h: number) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + h); return d.toISOString(); };
/** A few hours from now, but never before 7am: a demo opened after midnight still shows a hit at a sensible hour. */
const laterToday = (h: number) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(Math.max(d.getHours() + h, 7)); return d.toISOString(); };
const tomorrowAt = (hour: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const daysFromNowAt = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
/** Some minutes ago, to the minute: a hit that has just been played. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const at = (n: number) => { const c = DEMO_PARK(n); return { id: c.id, name: c.name ?? 'Public courts', lat: c.lat, lng: c.lng }; };

/**
 * Demo open hits, timed from when the demo loads, one for each case Find
 * Players and the map have to get right: two at demo parks near you (with
 * the court's id, so they show on its page), one at a place only typed (no
 * spot: it sits in the list without a distance), one in San Diego (under
 * "Further away"), and one by Ella, a teen, which an adult who does not
 * follow her must not see anywhere.
 */
export const demoHits: HitRequest[] = [
  { id: 'hit-demo-1', authorId: 'u-sam', startsAt: laterToday(3), place: at(1), levelMin: 3.5, levelMax: 4.5, format: 'singles', spots: 1, note: 'Lefty, steady rally pace. Bring balls if you have a fresh can.', createdAt: hoursFromNow(-2), joinedIds: [] },
  { id: 'hit-demo-2', authorId: 'u-marcus', startsAt: tomorrowAt(9), place: at(3), format: 'doubles', spots: 3, note: 'Easygoing doubles, all levels welcome.', createdAt: hoursFromNow(-5), joinedIds: ['u-sam'] },
  { id: 'hit-demo-3', authorId: 'u-priya', startsAt: daysFromNowAt(2, 18), place: { name: 'Oak Knoll school courts' }, levelMin: 4.0, levelMax: 5.0, format: 'hit', spots: 1, createdAt: hoursFromNow(-20), joinedIds: [] },
  { id: 'hit-demo-4', authorId: 'u-tomas', startsAt: daysFromNowAt(3, 8), place: { name: 'Harbor View Park', lat: 32.72, lng: -117.16 }, format: 'singles', spots: 1, note: 'In San Diego for the weekend.', createdAt: hoursFromNow(-30), joinedIds: [] },
  { id: 'hit-demo-5', authorId: 'u-ella', startsAt: laterToday(5), place: at(2), format: 'singles', spots: 1, createdAt: hoursFromNow(-1), joinedIds: [] },
  // Mira's hit that you joined, played and over (it started six and a half
  // hours ago), so "How was the hit?" shows in the demo. No list shows it:
  // a hit leaves them an hour after it starts. Well clear of the demo's
  // WHOOP session (act-demo-1, three hours ago): one that overlapped would
  // be logged as that session instead, so it shows the hit filled in by hand.
  { id: 'hit-demo-6', authorId: 'u-mira', startsAt: minutesAgo(390), place: at(1), format: 'hit', spots: 1, createdAt: hoursFromNow(-26), joinedIds: [CURRENT_USER_ID] },
  // Sam's hit that you were in, which Sam has just called off (migration
  // 150): no list shows it, and its alert and the line in its chat say so.
  { id: 'hit-demo-7', authorId: 'u-sam', startsAt: laterToday(2), place: at(1), format: 'singles', spots: 1, createdAt: hoursFromNow(-6), joinedIds: [CURRENT_USER_ID], conversationId: 'cv-hit-demo-7', cancelled: true },
  // Your own hit tomorrow evening, which Priya was in until she tapped
  // "Can't make it": its spot is open again, and her note is in your alerts.
  { id: 'hit-demo-8', authorId: CURRENT_USER_ID, startsAt: tomorrowAt(18), place: at(2), levelMin: 3.5, levelMax: 4.5, format: 'singles', spots: 1, note: 'Match play, best of three tiebreak sets.', createdAt: hoursFromNow(-8), joinedIds: [] },
];

/** The demo hits only a player who has been here a while has: one they joined, and one of their own (see api's `?new=1`). */
export const DEMO_HITS_OF_YOURS = ['hit-demo-7', 'hit-demo-8'];

/**
 * When a hit is, the way the server says it in a note (hit_when, migration
 * 53): "today at 8:00 AM", "tomorrow at 6:00 PM", "Saturday at 9:00 AM".
 */
function serverWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86_400_000);
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

const calledOff = demoHits.find((h) => h.id === 'hit-demo-7')!;
const freedUp = demoHits.find((h) => h.id === 'hit-demo-8')!;

/**
 * The notes those two hits left, worded as the server words them
 * (migration 151): Sam called off the hit you were in, and Priya can't make
 * yours. Each opens its hit (Sam's, its chat).
 */
export const demoHitNotifications: Notification[] = [
  { id: 'n-hit-called-off', userId: CURRENT_USER_ID, actorId: 'u-sam', kind: 'hit-called-off', targetId: calledOff.id, targetKind: 'hit-request', createdAt: minutesAgo(12), read: false, preview: `${serverWhen(calledOff.startsAt)} · ${calledOff.place.name}` },
  { id: 'n-hit-left', userId: CURRENT_USER_ID, actorId: 'u-priya', kind: 'hit-left', targetId: freedUp.id, targetKind: 'hit-request', createdAt: minutesAgo(48), read: false, preview: `${serverWhen(freedUp.startsAt)} · 1 spot open again` },
];

/**
 * The chat Sam's hit made when you joined it ("Hit · <court>", migration
 * 54): your join, a few words to sort it out, then Sam calling it off, and
 * the line the server writes when a hit is called off.
 */
export const demoHitChat: { conversation: Conversation; messages: Message[] } = {
  conversation: {
    id: 'cv-hit-demo-7', participantIds: ['u-sam', CURRENT_USER_ID], isGroup: true, title: `Hit · ${calledOff.place.name}`,
    createdBy: 'u-sam', adminIds: ['u-sam'],
    messageIds: ['m-hit7-1', 'm-hit7-2', 'm-hit7-3', 'm-hit7-4', 'm-hit7-5'],
    updatedAt: minutesAgo(12), unreadCount: 1,
  },
  messages: [
    { id: 'm-hit7-1', conversationId: 'cv-hit-demo-7', senderId: CURRENT_USER_ID, body: 'You’re in for the hit', createdAt: minutesAgo(5 * 60), kind: 'system', event: { type: 'joined' } },
    { id: 'm-hit7-2', conversationId: 'cv-hit-demo-7', senderId: 'u-sam', body: 'Nice, see you there. I’ll grab a court by the fence.', createdAt: minutesAgo(5 * 60 - 4), kind: 'text' },
    { id: 'm-hit7-3', conversationId: 'cv-hit-demo-7', senderId: CURRENT_USER_ID, body: 'Perfect. I’ll bring a fresh can.', createdAt: minutesAgo(5 * 60 - 6), kind: 'text' },
    { id: 'm-hit7-4', conversationId: 'cv-hit-demo-7', senderId: 'u-sam', body: 'Sorry, got pulled into work. Same time next week?', createdAt: minutesAgo(13), kind: 'text' },
    { id: 'm-hit7-5', conversationId: 'cv-hit-demo-7', senderId: 'u-sam', body: 'Sam called off this hit', createdAt: minutesAgo(12), kind: 'system', event: { type: 'called-off', hitId: 'hit-demo-7' } },
  ],
};
