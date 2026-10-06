import type { QuestionTopic } from '@/data/types';

/**
 * A thread that didn't post (no connection, say), kept on this phone so Ask
 * the room opens with it already typed instead of empty. One at a time, and
 * only until Ask the room has opened with it.
 */
export interface UnsentThread { title: string; body: string; topic: QuestionTopic; poll?: string[] }

let unsent: UnsentThread | null = null;

export function keepUnsentThread(thread: UnsentThread) { unsent = thread; }
export function peekUnsentThread(): UnsentThread | null { return unsent; }
export function clearUnsentThread() { unsent = null; }
