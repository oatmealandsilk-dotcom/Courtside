import type { ID } from '@/data/types';

/**
 * Which chat is the page in front right now (the app may be in the
 * background meanwhile), so a tapped alert about that same chat leaves it
 * where it is instead of opening a second copy of it on top, which Back then
 * landed on (Oct 5). Set by the chat page while it is in front.
 */
let inFront: ID | null = null;

/** The chat page came to the front; returns what to call when it leaves. */
export function chatCameToFront(conversationId: ID): () => void {
  inFront = conversationId;
  return () => { if (inFront === conversationId) inFront = null; };
}

/** Whether this chat is the page in front. */
export const isChatInFront = (conversationId: ID) => inFront === conversationId;
