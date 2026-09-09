import { isoDaysAgo } from '@/lib/format';
import type { Conversation, Message } from '../types';
import { CURRENT_USER_ID } from './users';

/**
 * Seed DM threads. Instagram-shaped: one thread per person, newest last,
 * with a couple of shared posts so the share flow has something to render.
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
];

export const conversations: Conversation[] = [
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
