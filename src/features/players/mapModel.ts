import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { searchPlaces, type Place } from '@/data/locations';
import type { TaggedCourt, User } from '@/data/types';
import { fetchCourts, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { homeFor, homeIsKnown, placeFor, positionFor, wideView, type LatLng } from '@/features/players/positions';
import { searchCitiesRemote } from '@/features/places/search';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { isOpenToHit } from '@/features/players/openToHit';
import { show as showToast } from '@/lib/toast';

export type MapFilter = 'all' | 'open' | 'near' | 'level' | 'coaches';
/** A player set down on the map, with how far that is from you, and when they were last there. */
export interface Placed { user: User; at: LatLng; miles: number; seenAt?: string; seenCity?: string }

/**
 * Towns typed on profiles that aren't in the built-in list, looked up once
 * each per visit ("Cary, NC" → where Cary is). Null means looked up and
 * not found, so it isn't asked again.
 */
const townCache = new Map<string, LatLng | null>();
const townKey = (location: string) => location.trim().toLowerCase();

/** Inside this many miles someone counts as in your town. */
export const IN_TOWN_MILES = 30;

/**
 * Everything the map knows that is not the map itself: where you are, where
 * everyone else is and how far, which of them the filters and the search
 * keep, who or what is picked, and the courts layer. The two map canvases
 * (phone, browser) draw from this and hand back taps.
 */
export function useMapModel(me: User, players: User[], fix?: LatLng | null, focus?: TaggedCourt | null) {
  const { lastSeen, actions } = useApp();
  // Profile towns outside the built-in list, found by name, so nobody from a
  // smaller town lands in the wrong city (or off the map).
  const [towns, setTowns] = useState(0);
  useEffect(() => {
    const wanted = [...new Set([me]
      .filter((u) => u.location?.trim() && !u.cityAt && !placeFor(u.location) && !townCache.has(townKey(u.location)))
      .map((u) => u.location.trim()))].slice(0, 25);
    if (!wanted.length) return;
    let live = true;
    (async () => {
      for (const location of wanted) {
        try {
          const [hit] = await searchCitiesRemote(location);
          townCache.set(townKey(location), hit ? { lat: hit.lat, lng: hit.lng } : null);
        } catch { /* offline: try again next time the map opens */ }
      }
      if (live) setTowns((n) => n + 1);
    })();
    return () => { live = false; };
  }, [me]);
  const townOf = useCallback((u: User) => (u.location ? townCache.get(townKey(u.location)) ?? null : null), [towns]); // eslint-disable-line react-hooks/exhaustive-deps
  // Without a fix here (a computer that was never asked), your own last spot
  // from the phone is the next best thing to where you are.
  const mine = lastSeen[me.id];
  const where = useMemo(() => fix ?? (mine ? { lat: mine.lat, lng: mine.lng } : null), [fix, mine]);
  const home = useMemo(() => homeFor(me, where, townOf(me)), [me, where, townOf]);
  const homeKnown = useMemo(() => homeIsKnown(me, where, townOf(me)), [me, where, townOf]);
  /** Your town close up, or zoomed out on your part of the world when it doesn't know it. */
  const homeView = useMemo(() => (homeKnown ? { center: home, zoom: null as number | null } : wideView()), [homeKnown, home]);
  /** Where the map opens: a tagged court when one was tapped, else your town. */
  // Street level, close enough for the court names to show.
  const start = useMemo(() => (focus ? { center: { lat: focus.lat, lng: focus.lng }, zoom: 15 as number | null } : homeView), [focus, homeView]);
  // Each opening fetches where people were last seen, so the map is never a day old.
  useEffect(() => { void actions.loadLastSeen(); }, [actions.loadLastSeen]);
  const ranked = useMemo<Placed[]>(
    () => players
      .flatMap((user) => {
        const seen = lastSeen[user.id];
        const at = positionFor(user, seen);
        return at ? [{ user, at, miles: milesBetween(home, at), seenAt: seen?.seenAt, seenCity: seen?.city }] : [];
      })
      .sort((a, b) => a.miles - b.miles),
    [players, home, lastSeen],
  );
  const inTown = useMemo(() => ranked.filter((p) => p.miles <= IN_TOWN_MILES), [ranked]);

  const [filter, setFilter] = useState<MapFilter>('all');
  const [query, setQuery] = useState('');
  const myBand = levelBadge(me.profile).tint;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter((p) => {
      if (filter === 'open' && !isOpenToHit(p.user)) return false;
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

  // Opened on a tagged court: the courts layer is on from the start.
  const [courtsOn, setCourtsOn] = useState(!!focus);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  // How many times the courts have come back (or failed to), so a tagged court waits for the first.
  const [courtsLoads, setCourtsLoads] = useState(0);
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
      setCourtsLoads((n) => n + 1);
    }
  }, []);
  useEffect(() => { if (courtsOn) void loadCourts(focus ?? home); }, [courtsOn, focus, home, loadCourts]);
  // The tagged court's card comes up as soon as the courts around it are in. It is
  // the same court if it is the same id or stands within a few hundred feet of it;
  // if the courts list has nothing there, the tag itself stands in for it.
  const focused = useRef(false);
  useEffect(() => {
    if (!focus || focused.current || courtsLoading || !courtsLoads) return;
    focused.current = true;
    const match = courts.find((c) => c.id === focus.id) ?? courts.find((c) => milesBetween(c, focus) < 0.15);
    if (match) { setSelectedCourtId(match.id); return; }
    setCourts((list) => [{ id: focus.id, name: focus.name, lat: focus.lat, lng: focus.lng, count: 1 }, ...list]);
    setSelectedCourtId(focus.id);
  }, [focus, courts, courtsLoading, courtsLoads]);
  const toggleCourts = useCallback(() => { setCourtsOn((on) => { if (on) setSelectedCourtId(null); return !on; }); }, []);

  // Your pin: only where you last shared your location (or where the phone says you are now).
  const mePos = where;

  // The still card in Find Players shows the city on your profile, the one you
  // picked at sign-up: never your live spot, and never a guess. No city, no map.
  const city = useMemo<LatLng | null>(() => {
    if (me.cityAt) return me.cityAt;
    const known = placeFor(me.location);
    return known ? { lat: known.lat, lng: known.lng } : townOf(me);
  }, [me, townOf]);
  /** A city typed on the profile that is still being looked up. */
  const cityPending = !city && !!me.location?.trim() && !townCache.has(townKey(me.location));
  const inCity = useMemo(() => (city ? ranked.filter((p) => milesBetween(city, p.at) <= IN_TOWN_MILES) : []), [city, ranked]);
  return { home, homeKnown, homeView, mePos, city, cityPending, inCity, start, ranked, inTown, filter, setFilter, query, setQuery, place, shown, selected, select, courtsOn, toggleCourts, courts: courtsOn ? courts : [], courtsLoading, loadCourts, selectedCourt, selectCourt };
}

export type MapModel = ReturnType<typeof useMapModel>;
