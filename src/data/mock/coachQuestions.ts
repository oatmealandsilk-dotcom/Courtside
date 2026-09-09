import { isoDaysAgo } from '@/lib/format';
import type { CoachQuestion, CoachReply } from '../types';
import { CURRENT_USER_ID } from './users';

/**
 * The "Ask a Coach" board. Players post what they are stuck on; verified
 * coaches answer in public. Free to ask, which is what feeds the paid tier.
 */
export const coachQuestions: CoachQuestion[] = [
  {
    id: 'cq-1',
    authorId: 'u-mira',
    title: 'Second serve collapses under pressure at 30-40',
    body:
      'Practice serves are fine — 70% in, decent kick. In matches, the second serve at any break point turns into a 55mph push and I get run over. Same toss, same motion in warmups. What actually fixes this: mechanics or routine?',
    specialty: 'mental',
    createdAt: isoDaysAgo(1, 3),
    replyIds: ['cr-1', 'cr-2'],
    resolved: false,
  },
  {
    id: 'cq-2',
    authorId: 'u-dev',
    title: 'One-handed backhand: high balls to my shoulder are unplayable',
    body:
      'Anything above chest height on the backhand side and I am either shanking it or slicing defensively. 4.0 level, righty, one-hander. Is taking it early the only answer or is there a technical fix?',
    specialty: 'backhand',
    createdAt: isoDaysAgo(2, 6),
    mediaLabel: 'Backhand rally · 0:41',
    replyIds: ['cr-3'],
    resolved: true,
  },
  {
    id: 'cq-3',
    authorId: CURRENT_USER_ID,
    title: 'Cramping in third sets — is this conditioning or fueling?',
    body:
      'Two three-setters in the last month, both times calves locked up around 4-4 in the third. I train four days a week and my recovery scores look fine. Not sure whether to add running or fix what I eat before matches.',
    specialty: 'fitness',
    createdAt: isoDaysAgo(4),
    replyIds: [],
    resolved: false,
  },
];

export const coachReplies: CoachReply[] = [
  {
    id: 'cr-1',
    questionId: 'cq-1',
    coachUserId: 'u-tomas',
    body:
      'Neither, usually. The motion does not change under pressure — the rhythm does. Players shorten the toss and rush the trophy position by about a tenth of a second, which kills the leg drive. Fix it with a fixed pre-serve routine you never skip: two bounces, breath out, toss. Then in practice, only serve second serves at 30-40 for ten minutes. You are training the situation, not the stroke.',
    createdAt: isoDaysAgo(1, 1),
    helpfulBy: ['u-mira', 'u-june'],
  },
  {
    id: 'cr-2',
    questionId: 'cq-1',
    coachUserId: 'u-nadia',
    body:
      'Adding to the above: film one practice second serve and one match second serve side by side. Nine times out of ten the match version has a lower toss and a flatter swing path. Seeing it yourself does more than being told.',
    createdAt: isoDaysAgo(0, 20),
    helpfulBy: ['u-mira'],
  },
  {
    id: 'cr-3',
    questionId: 'cq-2',
    coachUserId: 'u-tomas',
    body:
      'Technical fix first, positioning second. Most one-handers get jammed because the shoulder turn stops early — you are turning the arm, not the trunk. Start the unit turn as the ball crosses the net and get the racquet head above the hands at the set position. Then, yes, take the high ball earlier or step around it. Both, not either.',
    createdAt: isoDaysAgo(2, 1),
    helpfulBy: ['u-dev', 'u-mira', CURRENT_USER_ID],
  },
];
