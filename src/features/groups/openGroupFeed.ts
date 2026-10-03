import { goHome } from '@/lib/goBack';

/*
 * "See the feed" on a group's page: the Feed tab switches to that group's
 * words in its top row. Held until the Feed is there to take it (it may not
 * be built yet in a browser), then used once.
 */

let pending: string | null = null;
const listeners = new Set<(groupId: string) => void>();

export function openGroupFeed(groupId: string) {
  pending = groupId;
  listeners.forEach((l) => l(groupId));
  goHome();
}

/** The Feed listens; a group asked for before it was listening comes at once. */
export function onOpenGroupFeed(listener: (groupId: string) => void): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => { listeners.delete(listener); };
}

/** The Feed took it: a later visit opens on For you as usual. */
export function tookGroupFeed() { pending = null; }
