import { router } from 'expo-router';

import type { TaggedCourt } from '@/data/types';

/**
 * "Add location" opens its own page. The form that opened it is still
 * underneath, so the page hands the choice straight back to it here rather
 * than through the address bar. A court picked from the list comes back
 * with its name as the location and the court itself, for the tag.
 */
let pending: { onPick: (value: string, court?: TaggedCourt) => void; initial: string } | null = null;

export function openPlacePicker(onPick: (value: string, court?: TaggedCourt) => void, initial = '') {
  pending = { onPick, initial };
  router.push('/pick-location');
}

export function takePlacePicker() {
  const p = pending;
  pending = null;
  return p;
}
