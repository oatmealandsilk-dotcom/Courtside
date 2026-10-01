import { isoDaysAgo } from '@/lib/format';
import type { Conversation, Message } from '../types';
import { CURRENT_USER_ID } from './users';

/**
 * Seed DM threads. Instagram-shaped: one thread per person, newest last,
 * with a couple of shared posts so the share flow has something to render.
 * One group too ("Saturday hitters", which you started), so the demo shows
 * an event line, a court, a shared post, several voices and "Seen by".
 */
export const messages: Message[] = [
  {
    id: 'm-mira-1',
    conversationId: 'cv-mira',
    senderId: 'u-mira',
    body: 'That kick serve clip you posted — what grip are you on? Looks closer to continental than mine.',
    createdAt: isoDaysAgo(1, 4),
    kind: 'text',
  },
  {
    id: 'm-mira-2',
    conversationId: 'cv-mira',
    senderId: CURRENT_USER_ID,
    body: 'Continental, edge on. Took a month to stop shanking it.',
    createdAt: isoDaysAgo(1, 3),
    kind: 'text',
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
    place: { name: 'Griffith Park Riverside Courts', lat: 34.1105, lng: -118.2721 },
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
    messageIds: ['m-sat-1', 'm-sat-2', 'm-sat-3', 'm-sat-4', 'm-sat-5', 'm-sat-7', 'm-sat-6'],
    updatedAt: isoDaysAgo(0, 1),
    // You answered after June's message, so nothing in it is new to you.
    unreadCount: 0,
  },
  {
    id: 'cv-mira',
    participantIds: [CURRENT_USER_ID, 'u-mira'],
    messageIds: ['m-mira-1', 'm-mira-2', 'm-mira-3'],
    updatedAt: isoDaysAgo(0, 5),
    unreadCount: 1,
  },
  {
    id: 'cv-june',
    participantIds: [CURRENT_USER_ID, 'u-june'],
    messageIds: ['m-june-1'],
    updatedAt: isoDaysAgo(0, 2),
    unreadCount: 1,
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
