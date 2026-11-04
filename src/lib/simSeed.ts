import type { Answer, Question } from '@/data/types';
import { SIM_DRIVER } from '@/lib/simDriver';
import { CURRENT_USER_ID } from '@/data/mock/users';

/*
 * The simulator's proof only (simDriver: a demo build bundled with EXPO_PUBLIC_SIM_DRIVER=1; nothing at all in a store
 * build, an over-the-air update or the website, simSeed.web.ts): one long thread with photos added to the demo, for
 * timing a long thread's open, as the demo's own threads are all short and have no pictures; and a short thread of the
 * demo player's own, for Edit thread's proof (q-sim-edit). Its photos are files the
 * Mac puts in the app's Documents folder (sim-photo-1.jpg ...), so they load the same way every time.
 */
const AUTHORS = ['u-tomas', 'u-june', 'u-dev', 'u-mira', 'u-nadia', 'u-leo', 'u-sam', 'u-priya', 'u-marcus', 'u-rosa', 'u-kai', 'u-ella'];
const WORDS = [
  'Short answer: it depends on how often you play and what your arm already tells you. I went through the same thing last spring and the change that helped most was the tension, not the string.',
  'Film yourself from the side. Nine times out of ten the problem shows up in the first two frames of the swing, long before contact, and you will never feel it while you are hitting.',
  'Our club did this as a drill for six weeks: one serve, one return, reset. Boring, but the returns got better faster than anything else we tried.',
  'Here is what my setup looked like after the change. Not pretty, but it worked for me and the soreness went away in about three weeks.',
  'Agree with the above. I would add: do not change two things at once, or you will never know which one helped.',
  'Coach here. The load question matters more than the technique one at 4.0. Count hours, not sessions.',
];

export function simLongThread(): { questions: Question[]; answers: Answer[] } {
  if (!SIM_DRIVER) return { questions: [], answers: [] };
  let docs = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Paths } = require('expo-file-system') as typeof import('expo-file-system');
    docs = Paths.document.uri.replace(/\/?$/, '/');
  } catch { /* no photos then */ }
  const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const answers: Answer[] = Array.from({ length: 24 }, (_, i) => ({
    id: `a-sim-long-${i + 1}`,
    questionId: 'q-sim-long',
    authorId: AUTHORS[i % AUTHORS.length],
    body: WORDS[i % WORDS.length],
    createdAt: at(10 - i * 0.3),
    votes: 40 - i,
    votedBy: {},
    fromCoach: i % 7 === 5,
    ...(i % 3 === 0 && docs ? { media: { kind: 'photo' as const, url: `${docs}sim-photo-${(i / 3) + 1}.jpg` } } : {}),
    ...(i % 5 === 4 ? { parentAnswerId: `a-sim-long-${i}` } : {}),
  }));
  const question: Question = {
    id: 'q-sim-long',
    authorId: 'u-mira',
    title: 'Show me your stringing setup and what changed your game the most this year',
    body: 'Long one. Post a picture of your setup if you have one. What string, what tension, how often you restring, and the one change that made the biggest difference for you this season. I will start: I dropped four pounds of tension and my elbow finally stopped complaining.',
    topic: 'gear',
    createdAt: at(12),
    tags: ['strings', 'setup'],
    votes: 64,
    votedBy: {},
    answerIds: answers.map((a) => a.id),
  };
  // Edit thread's proof (Nov 4): a short thread of the demo player's own, to edit the way the owner did, with a few
  // replies under it so the page can be seen taking the new words.
  const editReplies: Answer[] = [
    { id: 'a-sim-edit-1', questionId: 'q-sim-edit', authorId: 'u-mira', body: 'Club final, 5-5 in the third. Called a clean ace out. I asked once, nicely, then let it go.', createdAt: at(1), votes: 9, votedBy: {}, fromCoach: false },
    { id: 'a-sim-edit-2', questionId: 'q-sim-edit', authorId: 'u-dev', body: 'If there is no umpire, I offer to replay the point. Most people take it.', createdAt: at(0.7), votes: 5, votedBy: {}, fromCoach: false },
    { id: 'a-sim-edit-3', questionId: 'q-sim-edit', authorId: 'u-june', body: 'A foot out on match point. Shook hands. Still think about it.', createdAt: at(0.4), votes: 3, votedBy: {}, fromCoach: false },
  ];
  const editThread: Question = {
    id: 'q-sim-edit',
    authorId: CURRENT_USER_ID,
    title: 'What’s the worst line call',
    body: '',
    topic: 'rules',
    createdAt: at(2),
    tags: [],
    votes: 12,
    votedBy: {},
    answerIds: editReplies.map((a) => a.id),
  };
  return { questions: [editThread, question], answers: [...answers, ...editReplies] };
}
