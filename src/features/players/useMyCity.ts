import { useEffect, useMemo, useState } from 'react';

import type { User } from '@/data/types';
import { placeFor, type LatLng } from '@/features/players/positions';
import { searchCitiesRemote } from '@/features/places/search';

/**
 * Towns typed on profiles that aren't in the built-in list, looked up once
 * each per visit ("Cary, NC" → where Cary is). Null means looked up and
 * not found, so it isn't asked again. Two screens asking at once share one ask.
 */
const townCache = new Map<string, LatLng | null>();
const asking = new Map<string, Promise<LatLng | null>>();
const townKey = (location: string) => location.trim().toLowerCase();

function lookUpTown(location: string): Promise<LatLng | null> {
  const key = townKey(location);
  if (townCache.has(key)) return Promise.resolve(townCache.get(key) ?? null);
  const pending = asking.get(key);
  if (pending) return pending;
  const ask = searchCitiesRemote(location)
    .then(([hit]) => { const at = hit ? { lat: hit.lat, lng: hit.lng } : null; townCache.set(key, at); return at; })
    .finally(() => asking.delete(key));
  asking.set(key, ask);
  return ask;
}

/**
 * The city on your profile, as a spot: the one picked from the search
 * (cityAt), or a city the app knows by name, or a town looked up by name.
 * Never your live position and never a guess. `pending` while a typed town
 * is still being looked up; `town` is that looked-up spot on its own (the
 * map uses it for where you are when nothing better is known).
 *
 * The answer is held in state, so every screen using this redraws when a
 * lookup lands: many profiles have a typed town and no stored spot.
 */
export function useMyCity(me: User | null | undefined): { city: LatLng | null; pending: boolean; town: LatLng | null } {
  const location = me?.location?.trim() ?? '';
  const needsLookup = !!location && !me?.cityAt && !placeFor(location);
  const [town, setTown] = useState<{ key: string; at: LatLng | null } | null>(() => {
    const key = townKey(location);
    return needsLookup && townCache.has(key) ? { key, at: townCache.get(key) ?? null } : null;
  });
  useEffect(() => {
    if (!needsLookup) return undefined;
    const key = townKey(location);
    let live = true;
    lookUpTown(location)
      .then((at) => { if (live) setTown({ key, at }); })
      // Offline: no city for now (not cached, so the next screen to open asks again).
      .catch(() => { if (live) setTown({ key, at: null }); });
    return () => { live = false; };
  }, [location, needsLookup]);
  const key = townKey(location);
  const looked = needsLookup && town?.key === key ? town.at : null;
  const cityAtLat = me?.cityAt?.lat;
  const cityAtLng = me?.cityAt?.lng;
  const city = useMemo<LatLng | null>(() => {
    if (cityAtLat !== undefined && cityAtLng !== undefined) return { lat: cityAtLat, lng: cityAtLng };
    const known = location ? placeFor(location) : undefined;
    if (known) return { lat: known.lat, lng: known.lng };
    return looked;
  }, [cityAtLat, cityAtLng, location, looked]);
  const pending = needsLookup && !(town?.key === key) && !townCache.has(key);
  return { city, pending, town: looked };
}
