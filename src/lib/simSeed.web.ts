import type { Answer, Question } from '@/data/types';

/* The simulator's proof only (simSeed.ts): the website has none of it. */
export function simLongThread(): { questions: Question[]; answers: Answer[] } { return { questions: [], answers: [] }; }
export function simFaces<T>(users: T[]): T[] { return users; }
