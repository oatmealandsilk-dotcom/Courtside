import { isoDaysAgo } from '@/lib/format';
import type { Conversation, Message } from '../types';
import { CURRENT_USER_ID } from './users';

/** A moment `m` minutes ago, for messages a few minutes apart. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Seed DM threads. Instagram-shaped: one thread per person, newest last,
 * with a couple of shared posts so the share flow has something to render.
 * One group too ("Saturday hitters", which you started), so the demo shows
 * an event line, courts (one from Mira, one from you), a shared post,
 * photos (two from Mira side by side, one of yours), several voices and
 * "Seen by". The photos are drawn by the app ("demo:" addresses, see
 * src/features/messages/DemoPhoto.tsx): the demo ships no picture files.
 */
export const messages: Message[] = [
  // Mira: a run of each kind, so the demo shows them together — words, a link
  // (its card), a reply quoting it, a photo with a caption, a voice note, a
  // court, reactions both ways, and an hour's quiet bringing a time line.
  {
    id: 'm-mira-1',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'That kick serve clip you posted — what grip are you on? Looks closer to continental than mine.',
    createdAt: minutesAgo(28 * 60),
    kind: 'text',
  },
  {
    id: 'm-mira-2',
    conversationId: 'cv-mira',
    senderId: CURRENT_USER_ID,
    body: 'Continental, edge on. Took a month to stop shanking it.',
    createdAt: minutesAgo(27 * 60),
    kind: 'text',
  },
  {
    // A bare link, right under the words before it: one run, its card joined on.
    id: 'm-mira-2b',
    conversationId: 'cv-mira',
    senderId: CURRENT_USER_ID,
    body: 'https://youtu.be/kickserve101',
    createdAt: minutesAgo(27 * 60 - 1),
    kind: 'text',
    reactions: { 'u-mira': '🔥' },
  },
  {
    // A reply: swiped from the link above, it carries a quote of it.
    id: 'm-mira-2c',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'Watching tonight. That toss cue is gold 🙌',
    createdAt: minutesAgo(27 * 60 - 8),
    kind: 'text',
    replyToId: 'm-mira-2b',
  },
  {
    id: 'm-mira-2d',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'New cans for Saturday',
    createdAt: minutesAgo(27 * 60 - 9),
    kind: 'photo',
    photos: [{ path: 'demo:balls', w: 1400, h: 1400 }],
    reactions: { [CURRENT_USER_ID]: '❤️' },
  },
  {
    // A voice note (the demo draws it; there is no recording to play).
    id: 'm-mira-2e',
    conversationId: 'cv-mira',
    senderId: CURRENT_USER_ID,
    body: 'Voice note',
    createdAt: minutesAgo(25 * 60),
    kind: 'voice',
    audio: { url: 'demo:voice', ms: 9000 },
  },
  {
    id: 'm-mira-3',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'Are you playing the Saturday round robin at Griffith?',
    createdAt: isoDaysAgo(0, 5),
    kind: 'text',
  },
  {
    id: 'm-mira-4',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'Griffith Park Riverside Courts',
    createdAt: new Date(Date.parse(isoDaysAgo(0, 5)) + 60_000).toISOString(),
    kind: 'court',
    place: { name: 'Griffith Park Riverside Courts', lat: 34.1105, lng: -118.2721, count: 12 },
  },

  {
    id: 'm-dev-1',
    conversationId: 'cv-dev',
    senderId: 'u-dev',
    body: 'Sent you the thread about poly strings — worth a read before you restring.',
    createdAt: isoDaysAgo(3),
    kind: 'text',
  },
  {
    id: 'm-dev-2',
    conversationId: 'cv-dev',
    senderId: 'u-dev',
    body: '',
    createdAt: isoDaysAgo(3),
    kind: 'question',
    sharedId: 'q1',
  },
  {
    id: 'm-dev-3',
    conversationId: 'cv-dev',
    senderId: CURRENT_USER_ID,
    body: 'Reading it now. My elbow will thank you.',
    createdAt: isoDaysAgo(2, 20),
    kind: 'text',
  },

  {
    id: 'm-june-1',
    conversationId: 'cv-june',
    senderId: 'u-june',
    body: 'Court 4 is open at 7 tomorrow if you want to hit before work.',
    createdAt: isoDaysAgo(0, 2),
    kind: 'text',
  },
  {
    // Words with a link in them: the link lights up in the bubble and its card sits under it.
    id: 'm-june-2',
    conversationId: 'cv-june',
    senderId: 'u-june',
    body: 'You can book it here before someone grabs it: www.laparks.org/tennis',
    createdAt: isoDaysAgo(0, 2),
    kind: 'text',
  },

  {
    // A bare link, the way most links arrive: the chat shows it as a preview
    // card (the demo's previews are in src/data/mock/linkPreviews.ts).
    id: 'm-sam-1',
    conversationId: 'cv-sam',
    senderId: 'u-sam',
    body: 'https://www.tiktok.com/@clayseason/video/7421503318874521902',
    createdAt: minutesAgo(38),
    kind: 'text',
  },

  {
    id: 'm-tomas-1',
    conversationId: 'cv-tomas',
    senderId: 'u-tomas',
    body: 'Got your serve footage. Breakdown coming back to you within 48 hours as promised.',
    createdAt: isoDaysAgo(4),
    kind: 'text',
  },
  {
    id: 'm-tomas-2',
    conversationId: 'cv-tomas',
    senderId: CURRENT_USER_ID,
    body: 'Appreciate it. Mostly want to know why the second serve sits up on the deuce side.',
    createdAt: isoDaysAgo(4),
    kind: 'text',
  },

  {
    id: 'm-sat-1',
    conversationId: 'cv-saturday',
    senderId: CURRENT_USER_ID,
    // The sentence the server would have written; the chat words it from `event`.
    body: 'Alex created the group "Saturday hitters"',
    createdAt: isoDaysAgo(1, 9),
    kind: 'system',
    event: { type: 'created', title: 'Saturday hitters' },
  },
  {
    id: 'm-sat-2',
    conversationId: 'cv-saturday',
    senderId: 'u-mira',
    body: 'Courts 3 and 4 are ours from 9 on Saturday. Who’s in?',
    createdAt: isoDaysAgo(1, 8),
    kind: 'text',
  },
  {
    id: 'm-sat-3',
    conversationId: 'cv-saturday',
    senderId: 'u-dev',
    body: 'In. I’ll bring a fresh can.',
    createdAt: isoDaysAgo(1, 7),
    kind: 'text',
  },
  {
    id: 'm-sat-4',
    conversationId: 'cv-saturday',
    senderId: 'u-mira',
    body: 'Griffith Park Riverside Courts',
    createdAt: isoDaysAgo(1, 7),
    kind: 'court',
    place: { name: 'Griffith Park Riverside Courts', lat: 34.1105, lng: -118.2721, count: 12 },
  },
  {
    id: 'm-sat-5',
    conversationId: 'cv-saturday',
    senderId: 'u-dev',
    body: '',
    createdAt: isoDaysAgo(1, 6),
    kind: 'post',
    sharedId: 'p3',
  },
  {
    id: 'm-sat-7',
    conversationId: 'cv-saturday',
    senderId: 'u-june',
    body: 'Running ten minutes late, but count me in.',
    createdAt: isoDaysAgo(0, 6),
    kind: 'text',
  },
  {
    id: 'm-sat-8',
    conversationId: 'cv-saturday',
    senderId: 'u-mira',
    body: 'From last Saturday. Same again?',
    createdAt: isoDaysAgo(0, 4),
    kind: 'photo',
    photos: [
      { path: 'demo:clay-sunset', w: 1200, h: 1600 },
      { path: 'demo:balls', w: 1400, h: 1400 },
    ],
    reactions: { 'u-dev': '🔥' },
  },
  {
    id: 'm-sat-9',
    conversationId: 'cv-saturday',
    senderId: CURRENT_USER_ID,
    body: '',
    createdAt: minutesAgo(76),
    kind: 'photo',
    photos: [{ path: 'demo:court-night', w: 1600, h: 1200 }],
  },
  {
    id: 'm-sat-10',
    conversationId: 'cv-saturday',
    senderId: CURRENT_USER_ID,
    body: 'Cypress Hollow Park',
    createdAt: minutesAgo(75),
    kind: 'court',
    place: { id: 'way9003000001', name: 'Cypress Hollow Park', lat: 34.0736, lng: -118.23, count: 6 },
  },
  {
    id: 'm-sat-6',
    conversationId: 'cv-saturday',
    senderId: CURRENT_USER_ID,
    body: 'I’m in. Doubles first, then king of the court?',
    createdAt: isoDaysAgo(0, 1),
    kind: 'text',
    // Yours is the newest, so the line under it shows: Mira and Dev have
    // read it and June has not yet, so it says "Seen by Mira, Dev".
    readAtBy: { 'u-mira': isoDaysAgo(0), 'u-dev': isoDaysAgo(0) },
    openedAtBy: { 'u-mira': isoDaysAgo(0), 'u-dev': isoDaysAgo(0) },
  },
];

export const conversations: Conversation[] = [
  {
    id: 'cv-saturday',
    participantIds: [CURRENT_USER_ID, 'u-mira', 'u-dev', 'u-june'],
    isGroup: true,
    title: 'Saturday hitters',
    createdBy: CURRENT_USER_ID,
    adminIds: [CURRENT_USER_ID],
    messageIds: ['m-sat-1', 'm-sat-2', 'm-sat-3', 'm-sat-4', 'm-sat-5', 'm-sat-7', 'm-sat-8', 'm-sat-9', 'm-sat-10', 'm-sat-6'],
    updatedAt: isoDaysAgo(0, 1),
    // You answered after June's message, so nothing in it is new to you.
    unreadCount: 0,
  },
  {
    id: 'cv-mira',
    participantIds: [CURRENT_USER_ID, 'u-mira'],
    messageIds: ['m-mira-1', 'm-mira-2', 'm-mira-2b', 'm-mira-2c', 'm-mira-2d', 'm-mira-2e', 'm-mira-3', 'm-mira-4'],
    updatedAt: new Date(Date.parse(isoDaysAgo(0, 5)) + 60_000).toISOString(),
    unreadCount: 2,
  },
  {
    id: 'cv-sam',
    participantIds: [CURRENT_USER_ID, 'u-sam'],
    messageIds: ['m-sam-1'],
    updatedAt: minutesAgo(38),
    unreadCount: 1,
  },
  {
    id: 'cv-june',
    participantIds: [CURRENT_USER_ID, 'u-june'],
    messageIds: ['m-june-1', 'm-june-2'],
    updatedAt: isoDaysAgo(0, 2),
    unreadCount: 2,
  },
  {
    id: 'cv-dev',
    participantIds: [CURRENT_USER_ID, 'u-dev'],
    messageIds: ['m-dev-1', 'm-dev-2', 'm-dev-3'],
    updatedAt: isoDaysAgo(2, 20),
    unreadCount: 0,
  },
  {
    id: 'cv-tomas',
    participantIds: [CURRENT_USER_ID, 'u-tomas'],
    messageIds: ['m-tomas-1', 'm-tomas-2'],
    updatedAt: isoDaysAgo(4),
    unreadCount: 0,
  },
];
