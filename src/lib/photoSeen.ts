import type { ImageTransition } from 'expo-image';

import { loadInOn } from '@/features/navigation/loadIn';

/*
 * The photos already shown this session (Nov 4, "nothing should just cut in"), for the photos that
 * load into a face or a tile: the first time a photo is shown it crossfades in over what stood in
 * for it (a face's coloured initials, a tile's blank), and from then on it is simply there. Never
 * the crossfade again: expo-image plays its transition on every load, the ones from its memory
 * included, so without this every page opened again would fade its faces in once more.
 * Admins first, with the rest of the load-in (loadIn.ts).
 */
const seen = new Set<string>();

/** The crossfade for a photo not yet shown this session. */
const FIRST_SHOWING: ImageTransition = { duration: 180, effect: 'cross-dissolve', timing: 'ease-out' };

/** Marks a photo as shown (its onLoad). */
export const markPhotoShown = (uri: string) => { seen.add(uri); };

/**
 * How a photo at `uri` comes in: its first showing this session crossfades (with `fallback` if the
 * caller had its own), any later one is there at once (0). With the load-in off, `fallback` as before.
 */
export function photoTransition(uri: string | undefined, fallback?: number | ImageTransition | null): number | ImageTransition | null | undefined {
  if (!loadInOn() || !uri) return fallback;
  return seen.has(uri) ? 0 : fallback ?? FIRST_SHOWING;
}

/** Whether the photo at `uri` still has its first showing to come (its onLoad should mark it). */
export const photoFirstShowing = (uri: string | undefined): boolean => !!uri && loadInOn() && !seen.has(uri);
