import { useSyncExternalStore } from 'react';

import type { ID } from '@/data/types';

/**
 * Posts an admin pushed to the bottom of feeds (migration 152, Oct 7, owner:
 * "like shadow banning ... put them to the very bottom of feeds"), as last
 * loaded. Read alongside the feed's numbers (features/feed/feedScores), at
 * the same moments; an answer that does not come (offline, a failed call)
 * leaves the last one in place. The server never includes your own posts,
 * so an author's own feed is exactly as it always was.
 *
 * Kept here rather than in the app's state for the same reason as the feed's
 * numbers: it only orders feeds. Admins also read it for the "Pushed down"
 * tag and the … menu's "Undo push to bottom" (useDemotedPosts). Nobody else
 * is ever shown anything about it.
 */
let down: ReadonlySet<ID> = new Set();
const listeners = new Set<() => void>();
/**
 * Pushes and undos made on this phone, newest count last, laid over any
 * answer that was asked for before them (that answer cannot know of them).
 */
const marks = new Map<ID, { on: boolean; n: number }>();
let count = 0;

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Every pushed-down post's id (never your own), as last loaded. */
export const demotedPosts = (): ReadonlySet<ID> => down;

/** Where this phone's own pushes and undos are counted up to: taken as an ask for the list starts. */
export const demotedAsked = (): number => count;

/**
 * The server's answer (asked when the count was `askedAt`), with whatever
 * this phone has pushed down or undone since laid over it.
 */
export function takeDemoted(ids: ID[], askedAt: number): void {
  const next = new Set(ids);
  for (const [id, mark] of marks) {
    if (mark.n <= askedAt) { marks.delete(id); continue; }
    if (mark.on) next.add(id); else next.delete(id);
  }
  if (next.size === down.size && [...next].every((id) => down.has(id))) return;
  down = next;
  emit();
}

/** An admin pushed a post down (or undid it) on this phone: shown at once, before the server's next answer. */
export function markDemoted(id: ID, on: boolean): void {
  count += 1;
  marks.set(id, { on, n: count });
  if (down.has(id) === on) return;
  const next = new Set(down);
  if (on) next.add(id); else next.delete(id);
  down = next;
  emit();
}

/** Another account signed in: the last one's answer goes. */
export function clearDemoted(): void {
  marks.clear();
  if (!down.size) return;
  down = new Set();
  emit();
}

/** The pushed-down posts, kept current on screen (the admins' tag and menu; the challenge's clips). */
export function useDemotedPosts(): ReadonlySet<ID> {
  return useSyncExternalStore(subscribe, demotedPosts, demotedPosts);
}

/** Calls `fn` whenever the list changes. */
export const onDemotedChange = (fn: () => void): (() => void) => subscribe(fn);
