import { useEffect, useMemo, useState } from 'react';

import { labelOf, score } from '@/features/places/courtName';
import { courtRows, searchCourtsByName, type Court, type CourtRow } from '@/features/players/courts';
import type { LatLng } from '@/features/players/positions';
import { plain } from '@/features/search/words';

const NONE: Court[] = [];

/**
 * Courts whose names answer what was typed, for every box that finds a court
 * by name (the map's search, Find Players, the chat's court picker, Search):
 * the courts already loaded around you at once, then, a beat after the
 * second letter, matching courts further away from our own database. One
 * row per place, named courts before unnamed ones, best match, then nearest.
 * Fewer than two letters finds nothing: one letter matches every park.
 */
export function useCourtSearch(text: string, near: LatLng | null, loaded: Court[] = NONE, max = 6): CourtRow[] {
  const key = plain(text);
  const words = useMemo(() => key.split(' ').filter(Boolean), [key]);
  const first = words[0] ?? '';
  const enough = key.replace(/\s/g, '').length >= 2;
  const nearLat = near?.lat;
  const nearLng = near?.lng;

  // Kept for the word asked about; every letter after it narrows them like the rest,
  // so a late answer only ever adds rows that still match.
  const [far, setFar] = useState<Court[]>(NONE);
  useEffect(() => {
    if (nearLat === undefined || nearLng === undefined || first.length < 2) return undefined;
    const control = new AbortController();
    const wait = setTimeout(() => {
      searchCourtsByName(first, { lat: nearLat, lng: nearLng }, control.signal)
        .then((list) => setFar(list))
        .catch(() => undefined);
    }, 200);
    return () => { clearTimeout(wait); control.abort(); };
  }, [first, nearLat, nearLng]);

  return useMemo(() => {
    if (!enough) return [];
    const from = nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : null;
    const ranked = courtRows([...loaded, ...far], from).flatMap((row) => {
      const rank = score(labelOf(row.c), words);
      return rank === null ? [] : [{ row, rank, unnamed: row.c.name === 'Tennis courts' ? 1 : 0 }];
    });
    ranked.sort((a, b) => a.unnamed - b.unnamed || a.rank - b.rank || a.row.miles - b.row.miles);
    return ranked.slice(0, max).map((x) => x.row);
  }, [enough, words, loaded, far, nearLat, nearLng, max]);
}
