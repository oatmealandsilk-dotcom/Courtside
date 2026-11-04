import type { Answer, Question } from '@/data/types';
import { SIM_DRIVER } from '@/lib/simDriver';

/*
 * The simulator's proof only (simDriver: a demo build bundled with EXPO_PUBLIC_SIM_DRIVER=1; nothing at all in a store
 * build, an over-the-air update or the website, simSeed.web.ts): one long thread with photos added to the demo, for
 * timing a long thread's open, as the demo's own threads are all short and have no pictures. Its photos are files the
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
  return { questions: [question], answers };
}

/**
 * The simulator's proof only (load-in, Nov 4): with EXPO_PUBLIC_SIM_FACES=1 bundled, every demo player has a profile photo,
 * a file the Mac puts in the app's Documents folder (sim-face-<id>.jpg), as the live app's players have; the demo's own
 * have none, so a face's photo arriving over its initials could not be seen. Nothing at all outside the harness.
 */
export function simFaces<T extends { id: string; avatarUrl?: string }>(users: T[]): T[] {
  if (!SIM_DRIVER || process.env.EXPO_PUBLIC_SIM_FACES !== '1') return users;
  let docs = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Paths } = require('expo-file-system') as typeof import('expo-file-system');
    docs = Paths.document.uri.replace(/\/?$/, '/');
  } catch { return users; }
  return users.map((u) => (u.avatarUrl ? u : { ...u, avatarUrl: `${docs}sim-face-${u.id}.jpg` }));
}
