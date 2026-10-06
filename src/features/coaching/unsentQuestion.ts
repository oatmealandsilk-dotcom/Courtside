import type { CoachSpecialty } from '@/data/types';

/**
 * A question to the coaches that didn't post (no connection, say), kept on
 * this phone so Ask a coach opens with it already typed instead of empty.
 * One at a time, and only until Ask a coach has opened with it. A clip isn't
 * kept: it is picked again.
 */
export interface UnsentCoachQuestion { title: string; body: string; specialty: CoachSpecialty }

let unsent: UnsentCoachQuestion | null = null;

export function keepUnsentCoachQuestion(question: UnsentCoachQuestion) { unsent = question; }
export function peekUnsentCoachQuestion(): UnsentCoachQuestion | null { return unsent; }
export function clearUnsentCoachQuestion() { unsent = null; }
