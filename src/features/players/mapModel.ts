import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { searchPlaces, type Place } from '@/data/locations';
import type { User } from '@/data/types';
import { fetchCourts, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { homeFor, positionFor, type LatLng } from '@/features/players/positions';
import { levelBadge } from '@/lib/badges';
import { show as showToast } from '@/lib/toast';

export type MapFilter = 'all' | 'near' | 'level' | 'coaches';
/** A player set down on the map, with how far that is from you. */
export interface Placed { user: User; at: LatLng; miles: number }

/** Inside this many miles someone counts as in your town. */
export const IN_TOWN_MILES = 30;

/**
 * Everything the map knows that is not the map itself: where you are, where
 * everyone else is and how far, which of them the filters and the search
 * keep, who or what is picked, and the courts layer. The two map canvases
 * (phone, browser) draw from this and hand back taps.
 */
export function useMapModel(me: User, players: User[], fix?: LatLng | null) {
  const home = useMemo(() => homeFor(me, fix), [me, fix]);
  const ranked = useMemo<Placed[]>(
    () => players.map((user) => { const at = positionFor(user, home); return { user, at, miles: milesBetween(home, at) }; }).sort((a, b) => a.miles - b.miles),
    [players, home],
  );
  const inTown = useMemo(() => ranked.filter((p) => p.miles <= IN_TOWN_MILES), [ranked]);

  const [filter, setFilter] = useState<MapFilter>('all');
  const [query, setQuery] = useState('');
  const myBand = levelBadge(me.profile).tint;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter((p) => {
      if (filter === 'near' && p.miles > IN_TOWN_MILES) return false;
      if (filter === 'coaches' && !p.user.isCoach) return false;
      if (filter === 'level' && levelBadge(p.user.profile).tint !== myBand) return false;
      if (q && !(p.user.name.toLowerCase().includes(q) || p.user.handle.toLowerCase().includes(q) || p.user.location.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [ranked, filter, query, myBand]);
  /** A city typed into the search, so the map can go there. */
  const place: Place | undefined = useMemo(() => (query.trim().length >= 3 ? searchPlaces(query, 1)[0] : undefined), [query]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => ranked.find((p) => p.user.id === selectedId) ?? null, [ranked, selectedId]);
  const select = useCallback((id: string | null) => { setSelectedId(id); if (id) setSelectedCourtId(null); }, []);

  const [courtsOn, setCourtsOn] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const selectedCourt = useMemo(() => courts.find((c) => c.id === selectedCourtId) ?? null, [courts, selectedCourtId]);
  const selectCourt = useCallback((id: string | null) => { setSelectedCourtId(id); if (id) setSelectedId(null); }, []);
  const lastCentre = useRef<LatLng | null>(null);
  const loadCourts = useCallback(async (centre: LatLng) => {
    // Only a real move re-asks; a nudge of a few streets does not.
    const last = lastCentre.current;
    if (last && milesBetween(last, centre) < 2) return;
    lastCentre.current = centre;
    setCourtsLoading(true);
    try {
      setCourts(await fetchCourts(centre));
    } catch {
      showToast({ title: 'Could not load courts', body: 'Check your connection and try again.', icon: 'tennisball-outline' });
    } finally {
      setCourtsLoading(false);
    }
  }, []);
  useEffect(() => { if (courtsOn) void loadCourts(home); }, [courtsOn, home, loadCourts]);
  const toggleCourts = useCallback(() => { setCourtsOn((on) => { if (on) setSelectedCourtId(null); return !on; }); }, []);

  return { home, ranked, inTown, filter, setFilter, query, setQuery, place, shown, selected, select, courtsOn, toggleCourts, courts: courtsOn ? courts : [], courtsLoading, loadCourts, selectedCourt, selectCourt };
}

export type MapModel = ReturnType<typeof useMapModel>;
