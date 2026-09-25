import { router } from 'expo-router';

/**
 * "Add location" opens its own page. The form that opened it is still
 * underneath, so the page hands the choice straight back to it here rather
 * than through the address bar.
 */
let pending: { onPick: (value: string) => void; initial: string } | null = null;

export function openPlacePicker(onPick: (value: string) => void, initial = '') {
  pending = { onPick, initial };
  router.push('/pick-location');
}

export function takePlacePicker() {
  const p = pending;
  pending = null;
  return p;
}
