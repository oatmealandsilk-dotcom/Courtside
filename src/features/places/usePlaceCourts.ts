import { useCallback, useEffect, useMemo, useState } from 'react';

import { sameCourt } from '@/features/places/court';
import type { FoundPlace } from '@/features/places/geocode';
import { courtRows, fetchCourts, peekCourts, rankForPlace, type Court, type CourtRow } from '@/features/players/courts';
import { useApp } from '@/store/AppContext';

/** The most rows a searched place lists. */
const PLACE_ROWS = 25;

/**
 * How far around a searched place its courts are fetched: a city or a
 * county, as far as the courts service reaches (25 km, about 15 miles); a
 * neighbourhood or a spot, the map's own ring (9 km). Both are areas the
 * rest of the app asks for too, so an answer already on the phone is used.
 */
const radiusFor = (place: FoundPlace) => (place.kind === 'area' && place.reach > 3 ? 25000 : 9000);

/** A box about the place's own size (and a mile over), for the courts played on this week (court rings). */
function ringBoxFor(place: FoundPlace) {
  const miles = Math.min(15, place.reach + 1);
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.max(0.2, Math.cos((place.lat * Math.PI) / 180)));
  return { minLat: place.lat - dLat, maxLat: place.lat + dLat, minLng: place.lng - dLng, maxLng: place.lng + dLng };
}

/**
 * The courts of a searched place, best first (rankForPlace): loaded the way
 * the map loads them (our own courts service, else OpenStreetMap), with
 * how much each was played on this week from the map's rings, which only
 * count what you may see. Nothing here asks about players: searching a
 * place never changes who the map shows you.
 */
export function usePlaceCourts(place: FoundPlace | null): { rows: CourtRow[]; loading: boolean; failed: boolean; retry: () => void } {
  const { courtRings, actions } = useApp();
  const { loadCourtRings } = actions;
  const [got, setGot] = useState<{ id: string; courts: Court[] } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const id = place?.id ?? null;

  useEffect(() => {
    if (!place) return undefined;
    let on = true;
    const at = { lat: place.lat, lng: place.lng };
    const radius = radiusFor(place);
    const kept = peekCourts(at, radius);
    if (kept) setGot({ id: place.id, courts: kept });
    setFailedId(null);
    fetchCourts(at, radius)
      .then((courts) => { if (on) setGot({ id: place.id, courts }); })
      .catch(() => { if (on) setFailedId(place.id); });
    void loadCourtRings(ringBoxFor(place)).catch(() => undefined);
    return () => { on = false; };
  }, [id, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setTries((n) => n + 1), []);
  const courts = got && got.id === id ? got.courts : null;
  const rows = useMemo(() => {
    if (!place || !courts) return [];
    // Posts and open hits there in the last 7 days, as the map's ring for it counts them (only rings around this place are looked through).
    const box = ringBoxFor(place);
    const here = courtRings.filter((r) => r.lat >= box.minLat - 0.05 && r.lat <= box.maxLat + 0.05 && r.lng >= box.minLng - 0.05 && r.lng <= box.maxLng + 0.05);
    const played = (c: Court) => here.reduce((n, r) => (sameCourt({ id: r.courtId, lat: r.lat, lng: r.lng }, c) ? n + r.posts + r.hits : n), 0);
    return rankForPlace(courtRows(courts, { lat: place.lat, lng: place.lng }), place, played, PLACE_ROWS);
  }, [place, courts, courtRings]);
  return { rows, loading: !!place && !courts && failedId !== id, failed: !!place && !courts && failedId === id, retry };
}
