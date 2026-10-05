import { useEffect, useMemo, useState } from 'react';

import { answerKey, keptPlaces, localPlaces, mergePlaces, roughBias, searchMapPlaces, type FoundPlace } from '@/features/places/geocode';
import type { LatLng } from '@/features/players/positions';
import { plain } from '@/features/search/words';

/** What the place search has to say about what is typed now. */
export interface PlaceSearch {
  places: FoundPlace[];
  /** The world's answer is on its way. */
  searching: boolean;
  /** The search could not be reached (offline, or it is down). */
  failed: boolean;
  /** The world's answer for what is typed now is in (or failed): only then can "No places found" be said. */
  done: boolean;
}

const NOTHING: PlaceSearch = { places: [], searching: false, failed: false, done: false };
/** A pause in typing before the world is asked: one ask per word, not per letter, as the search's fair-use rule wants. */
const WAIT_MS = 350;

/**
 * Places for a search box, as you type (geocode.ts): the built-in big
 * cities at once, then the world's answer a pause in typing later, leaning
 * toward `near` (only ever a rough area: roughBias). Two letters at least.
 * Each answer is kept for the session, so going back a letter asks nothing;
 * a newer letter calls off the ask before it. The same on a phone and in a
 * browser: it is one plain web request.
 */
export function usePlaceSearch(text: string, near: LatLng | null, max = 5): PlaceSearch {
  const typed = text.trim();
  // A handle ("@sam") is a player, never a place: it is not sent to the place search at all.
  const enough = plain(typed).replace(/\s/g, '').length >= 2 && !typed.startsWith('@');
  // Only the rough area counts, so panning a few streets never asks again.
  const bias = near ? roughBias(near) : null;
  const biasLat = bias?.lat;
  const biasLng = bias?.lng;
  const rough = useMemo(() => (biasLat !== undefined && biasLng !== undefined ? { lat: biasLat, lng: biasLng } : null), [biasLat, biasLng]);
  const key = enough ? answerKey(typed, rough) : '';
  const [answer, setAnswer] = useState<{ key: string; places: FoundPlace[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (!key || keptPlaces(typed, rough)) return undefined;
    const control = new AbortController();
    const wait = setTimeout(() => {
      searchMapPlaces(typed, rough, control.signal)
        .then((places) => setAnswer({ key, places, failed: false }))
        .catch((err: unknown) => { if ((err as { name?: string })?.name !== 'AbortError') setAnswer({ key, places: [], failed: true }); });
    }, WAIT_MS);
    return () => { clearTimeout(wait); control.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!key) return NOTHING;
    const kept = keptPlaces(typed, rough);
    const now = kept ? { key, places: kept, failed: false } : answer?.key === key ? answer : null;
    // The world's answer first (it knows streets and parks); the built-in cities after, and alone until it comes or if it cannot.
    const places = mergePlaces(now?.places ?? [], localPlaces(typed, rough)).slice(0, max);
    return { places, searching: !now, failed: !!now?.failed, done: !!now };
  }, [key, answer, typed, rough, max]);
}
