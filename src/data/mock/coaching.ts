import { isoDaysAgo } from '@/lib/format';
import type { Coach, CoachingRequest, CoachResult, CoachReview } from '../types';
import { CURRENT_USER_ID } from './users';

export const coaches: Coach[] = [
  {
    id: 'co-tomas',
    userId: 'u-tomas',
    headline: 'Serve mechanics and clay court patterns',
    credentials: ['PTR Professional', 'Former ATP Challenger coach', '20 years teaching'],
    specialties: ['serve', 'strategy', 'footwork'],
    yearsCoaching: 20,
    ratingAvg: 4.9,
    ratingCount: 213,
    verified: true,
    responseTimeHours: 12,
    services: [
      {
        id: 's-tomas-video',
        title: 'Serve video breakdown',
        description:
          'Send two angles of your serve (side and behind). You get a frame-by-frame written breakdown, the one change that matters most, and two drills to make it stick.',
        priceCents: 6500,
        turnaroundHours: 48,
        kind: 'video-review',
      },
      {
        id: 's-tomas-qa',
        title: 'Written Q&A',
        description: 'One detailed question, one detailed answer. Good for tactics and match debriefs.',
        priceCents: 2500,
        turnaroundHours: 24,
        kind: 'written-qa',
      },
      {
        id: 's-tomas-plan',
        title: 'Four-week tournament prep plan',
        description:
          'A written block built around your tournament date, your court access, and any injury limits you have logged.',
        priceCents: 18000,
        turnaroundHours: 96,
        kind: 'plan',
      },
    ],
  },
  {
    id: 'co-mira',
    userId: 'u-mira',
    headline: 'Junior development and return of serve',
    credentials: ['USPTA Elite', 'Former D1 #1 singles', 'Junior academy director'],
    specialties: ['juniors', 'forehand', 'strategy', 'mental'],
    yearsCoaching: 9,
    ratingAvg: 4.8,
    ratingCount: 147,
    verified: true,
    responseTimeHours: 18,
    services: [
      {
        id: 's-mira-video',
        title: 'Groundstroke video review',
        description: 'Forehand or backhand, two angles. Written notes plus a corrective drill progression.',
        priceCents: 5500,
        turnaroundHours: 48,
        kind: 'video-review',
      },
      {
        id: 's-mira-live',
        title: 'Live video session (45 min)',
        description: 'Screen-share match footage and work through tactics live.',
        priceCents: 9000,
        turnaroundHours: 72,
        kind: 'live-session',
      },
    ],
  },
  {
    id: 'co-nadia',
    userId: 'u-nadia',
    headline: 'Strength, movement, and return-to-play for racquet athletes',
    credentials: ['CSCS', 'MS Exercise Physiology', 'Works with ITF juniors'],
    specialties: ['fitness', 'footwork'],
    yearsCoaching: 11,
    ratingAvg: 5.0,
    ratingCount: 88,
    verified: true,
    responseTimeHours: 24,
    services: [
      {
        id: 's-nadia-plan',
        title: 'Off-court strength block (6 weeks)',
        description:
          'Built around your court schedule and any injury constraints on your profile. Two or three sessions a week, no fluff.',
        priceCents: 14000,
        turnaroundHours: 72,
        kind: 'plan',
      },
      {
        id: 's-nadia-qa',
        title: 'Movement screen Q&A',
        description: 'Send a short movement video and get a written assessment of what to prioritise.',
        priceCents: 3500,
        turnaroundHours: 36,
        kind: 'written-qa',
      },
    ],
  },
];

export const coachingRequests: CoachingRequest[] = [
  {
    id: 'cr1',
    coachId: 'co-tomas',
    userId: CURRENT_USER_ID,
    serviceId: 's-tomas-video',
    question:
      'Second serve sits up under pressure. Two angles attached from Tuesday. Shoulder gets tight so I capped it at 80 balls.',
    videoLabel: 'serve-two-angles.mp4 · 1:24',
    status: 'answered',
    createdAt: isoDaysAgo(9),
    respondedAt: isoDaysAgo(7),
    response:
      'Watched both angles twice. The motion is fine — the problem starts before you swing.\n\nOn the second serve your toss drops about a foot further back than on the first. That forces you to arch instead of rotate, which is also why the shoulder complains. You are not serving with your arm too much; you are serving from a position where the arm is the only thing left.\n\nOne change: same toss location for both serves, out in front, so far in front it feels wrong at first. Second serve becomes a spin decision, not a position decision.\n\nTwo drills:\n1. Toss and catch, 20 reps, no racquet. Catch it in front of your front foot or it does not count.\n2. Kick serve at 60% to the backhand box, 4 sets of 10, tracking only where the toss landed and not where the serve landed.\n\nRe-send in three weeks and we will look at the rotation.',
  },
  {
    id: 'cr2',
    coachId: 'co-nadia',
    userId: CURRENT_USER_ID,
    serviceId: 's-nadia-qa',
    question: 'What should I be doing on off days that helps the shoulder rather than aggravating it?',
    status: 'in-review',
    createdAt: isoDaysAgo(2),
  },
];

/* ------------------------- Results and reviews ------------------------- */

export const coachResults: CoachResult[] = [
  { id: 'res1', coachId: 'co-tomas', clientName: 'Priya', focus: 'Second serves in', before: '41%', after: '63%', weeks: 6, note: 'Fixed the toss drift first; the rest followed.' },
  { id: 'res2', coachId: 'co-tomas', clientName: 'Marcus', focus: 'First-serve speed', before: '84 mph', after: '97 mph', weeks: 10 },
  { id: 'res3', coachId: 'co-mira', clientName: 'Elena', focus: 'Forehand unforced errors / set', before: '11', after: '5', weeks: 8, note: 'Contact point moved forward and the grip stopped slipping.' },
  { id: 'res4', coachId: 'co-mira', clientName: 'Jae', focus: 'UTR', before: '4.8', after: '6.1', weeks: 24 },
  { id: 'res5', coachId: 'co-nadia', clientName: 'Sam', focus: 'Split-step reaction', before: '0.42 s', after: '0.31 s', weeks: 5 },
  { id: 'res6', coachId: 'co-nadia', clientName: 'Rosa', focus: 'Third-set win rate', before: '30%', after: '60%', weeks: 12, note: 'Conditioning block plus a hydration plan.' },
];

export const coachReviews: CoachReview[] = [
  { id: 'rev1', coachId: 'co-tomas', authorId: 'u-dev', rating: 5, body: 'Watched a 40-second clip and named the exact thing three other coaches had missed. Second serve is a weapon now, not a prayer.', createdAt: isoDaysAgo(9) },
  { id: 'rev2', coachId: 'co-tomas', authorId: 'u-june', rating: 5, body: 'Direct, specific, no fluff. Sent me one drill and it stuck.', createdAt: isoDaysAgo(23) },
  { id: 'rev3', coachId: 'co-mira', authorId: 'u-june', rating: 5, body: 'My forehand finally goes where I look. The frame-by-frame breakdown was worth every cent.', createdAt: isoDaysAgo(14) },
  { id: 'rev4', coachId: 'co-mira', authorId: 'u-dev', rating: 4, body: 'Great eye for technique. Reply took a little longer than the listed turnaround.', createdAt: isoDaysAgo(31) },
  { id: 'rev5', coachId: 'co-nadia', authorId: 'u-june', rating: 5, body: 'First coach who asked about my sleep before my footwork. The plan fit around a real job.', createdAt: isoDaysAgo(6) },
];
