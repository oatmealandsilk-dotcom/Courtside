import { router } from 'expo-router';

import type { SessionPick } from './recent';

/**
 * "Add session stats" opens its own sheet (app/pick-session) over the post
 * being written. The post is still underneath, so the sheet hands the pick
 * straight back to it here rather than through the address, the way "Add
 * location" does (features/places/picker). `logged` says the sheet just
 * logged a tracker's session on the way, so the post can say so.
 */
let pending: ((pick: SessionPick, logged: boolean) => void) | null = null;

export function openSessionPicker(onPick: (pick: SessionPick, logged: boolean) => void) {
  pending = onPick;
  router.push('/pick-session');
}

export function takeSessionPicker() {
  const p = pending;
  pending = null;
  return p;
}
