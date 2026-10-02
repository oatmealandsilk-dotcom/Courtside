import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { searchPlaces, type Place } from '@/data/locations';
import type { HitRequest, TaggedCourt, User } from '@/data/types';
import { NEAR_HIT_MILES, canSeeHitAt, hitSpot, openHits } from '@/features/hits/visible';
import { sameCourt } from '@/features/places/court';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { homeFor, homeIsKnown, positionFor, wideView, type LatLng } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { isOpenToHit } from '@/features/players/openToHit';
import { show as showToast } from '@/lib/toast';

export type MapFilter = 'all' | 'open' | 'near' | 'level' | 'coaches';
/** A player set down on the map, with how far that is from you, and when they were last there. */
export interface Placed { user: User; at: LatLng; miles: number; seenAt?: string; seenCity?: string }
/** An open hit with a spot, for a flag on the map. */
export interface PlacedHit { hit: HitRequest; at: { id?: string; name: string; lat: number; lng: number } }

/** The still card's court dots: enough to say "there are courts here", not every one. */
const CARD_COURTS = 30;
/** The still card's hit flags: the soonest few; the line under the city counts the rest. */
const CARD_FLAGS = 3;
/**
 * Courts load for where the map comes to rest only this close in (a city or
 * nearer). Zoomed out on a country, a few dozen pins would say nothing, and
 * every pan there would ask again.
 */
export const COURTS_MIN_ZOOM = 10;

/** Inside this many miles someone counts as in your town. */
export const IN_TOWN_MILES = 30;

/**
 * Everything the map knows that is not the map itself: where you are, where
 * everyone else is and how far, which of them the filters and the search
 * keep, who or what is picked, the courts layer and the open hits. The two
 * map canvases (phone, browser) draw from this and hand back taps.
 *
 * `card` is the still map on Find Players: it shows your city's courts as
 * quiet dots and the soonest hits near you, and never loads the full court pins.
 * `focusHit` opens the map with that hit's card up.
 */
export function useMapModel(me: User, players: User[], fix?: LatLng | null, focus?: TaggedCourt | null, card = false, focusHit?: string | null) {
  const { lastSeen, actions, hitRequests, users, followingIds, currentUserId, blockedIds, mutedIds } = useApp();
  // Your profile's city (and a typed town looked up by name, so nobody from a
  // smaller town lands in the wrong city, or off the map).
  const { city, pending: cityPending, town } = useMyCity(me);
  // Without a fix here (a computer that was never asked), your own last spot
  // from the phone is the next best thing to where you are.
  const mine = lastSeen[me.id];
  const where = useMemo(() => fix ?? (mine ? { lat: mine.lat, lng: mine.lng } : null), [fix, mine]);
  const home = useMemo(() => homeFor(me, where, town), [me, where, town]);
  const homeKnown = useMemo(() => homeIsKnown(me, where, town), [me, where, town]);
  /** Your town close up, or zoomed out on your part of the world when it doesn't know it. */
  const homeView = useMemo(() => (homeKnown ? { center: home, zoom: null as number | null } : wideView()), [homeKnown, home]);
  // Open hits with a spot, for flags: the same filters as Find Players (called
  // off, past, blocked, muted, the teen rule). A place only typed has no spot.
  const hits = useMemo<PlacedHit[]>(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    return openHits(hitRequests, { blockedIds, mutedIds })
      .filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId }))
      .flatMap((hit) => { const at = hitSpot(hit); return at ? [{ hit, at }] : []; });
  }, [hitRequests, users, blockedIds, mutedIds, followingIds, currentUserId]);
  // Opened on a hit (?hit=…): where it is, once the hits are in. Only a hit
  // you may see: one you may not (a minor's, a blocked player's, one called
  // off) opens the map on your town, the same as an id that does not exist.
  const hitAt = useMemo(() => {
    if (!focusHit) return null;
    const placed = hits.find((h) => h.hit.id === focusHit);
    return placed ? { lat: placed.at.lat, lng: placed.at.lng } : null;
  }, [focusHit, hits]);
  const hitLat = hitAt?.lat;
  const hitLng = hitAt?.lng;
  /** Where the map opens: a tagged court or a hit when one was tapped, else your town. */
  // Street level, close enough for the court names to show.
  const start = useMemo(() => (focus ? { center: { lat: focus.lat, lng: focus.lng }, zoom: 15 as number | null }
    : hitLat !== undefined && hitLng !== undefined ? { center: { lat: hitLat, lng: hitLng }, zoom: 14 as number | null }
      : homeView), [focus, hitLat, hitLng, homeView]);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => ranked.find((p) => p.user.id === selectedId) ?? null, [ranked, selectedId]);
  const [selectedHitId, setSelectedHitId] = useState<string | null>(null);
  // One card at a time: picking a player, a court or a hit puts the others' cards away.
  const select = useCallback((id: string | null) => { setSelectedId(id); if (id) { setSelectedCourtId(null); setSelectedHitId(null); } }, []);

  // The courts layer is on from the start: the courts are what the map is for
  // (the Courts chip still turns them off). Only the full map loads them.
  const [courtsOn, setCourtsOn] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  // How many times the courts have come back (or failed to), so a tagged court waits for the first.
  const [courtsLoads, setCourtsLoads] = useState(0);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const selectedCourt = useMemo(() => courts.find((c) => c.id === selectedCourtId) ?? null, [courts, selectedCourtId]);
  const selectCourt = useCallback((id: string | null) => { setSelectedCourtId(id); if (id) { setSelectedId(null); setSelectedHitId(null); } }, []);
  // Read inside a load that finishes later: what is picked then, and the list it was picked from.
  const pickedCourt = useRef<string | null>(null);
  pickedCourt.current = selectedCourtId;
  const courtsNow = useRef<Court[]>(courts);
  courtsNow.current = courts;
  const lastCentre = useRef<LatLng | null>(null);
  /** Courts around a spot. `zoom` is given for a move of the map: too far out, it does not ask. */
  const loadCourts = useCallback(async (centre: LatLng, zoom?: number) => {
    if (zoom !== undefined && zoom < COURTS_MIN_ZOOM) return;
    // Only a real move re-asks; a nudge of a few streets does not.
    const last = lastCentre.current;
    if (last && milesBetween(last, centre) < 2) return;
    lastCentre.current = centre;
    setCourtsLoading(true);
    try {
      let list = await fetchCourts(centre);
      // The court whose card is up stays up when the courts around it reload:
      // the same park under the new area's id (a name search and an area can
      // file one park under different ids), or else the old court kept in front.
      const pickedId = pickedCourt.current;
      if (pickedId && !list.some((c) => c.id === pickedId)) {
        const was = courtsNow.current.find((c) => c.id === pickedId);
        const same = was ? list.find((c) => sameCourt(c, was)) : undefined;
        if (same) setSelectedCourtId(same.id);
        else if (was) list = [was, ...list];
      }
      setCourts(list);
    } catch {
      showToast({ title: 'Could not load courts', body: 'Check your connection and try again.', icon: 'tennisball-outline' });
    } finally {
      setCourtsLoading(false);
      setCourtsLoads((n) => n + 1);
    }
  }, []);
  // The still card never loads the full pins (it would load them around your
  // live spot as well as the city, and draw both), and a map that only knows
  // a guessed city never loads courts there.
  useEffect(() => {
    if (!courtsOn || card) return;
    const at = focus ?? hitAt ?? (homeKnown ? home : null);
    if (at) void loadCourts(at);
  }, [courtsOn, card, focus, hitAt, homeKnown, home, loadCourts]);
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

  // Courts by name in the map's search: the ones loaded here at once, further
  // ones from our own database a beat later. The still card has no search.
  const courtResults = useCourtSearch(card ? '' : query, home, courts);
  /** A court picked from the search: shown (courts on, added if this area did not have it) with its card up, and the box cleared. */
  const pickCourt = useCallback((c: Court) => {
    setCourtsOn(true);
    setCourts((list) => (list.some((x) => x.id === c.id) ? list : [c, ...list]));
    setSelectedCourtId(c.id);
    setSelectedId(null);
    setSelectedHitId(null);
    setQuery('');
  }, []);
  /** A city typed into the search, so the map can go there; a court that matches goes first. */
  const place: Place | undefined = useMemo(() => (query.trim().length >= 3 && !courtResults.length ? searchPlaces(query, 1)[0] : undefined), [query, courtResults.length]);

  const selectedHit = useMemo(() => hits.find((h) => h.hit.id === selectedHitId) ?? null, [hits, selectedHitId]);
  const selectHit = useCallback((id: string | null) => { setSelectedHitId(id); if (id) { setSelectedId(null); setSelectedCourtId(null); } }, []);
  // Opened on a hit (?hit=…): its card comes up once it is in.
  const hitFocused = useRef(false);
  useEffect(() => {
    if (!focusHit || hitFocused.current || !hits.some((h) => h.hit.id === focusHit)) return;
    hitFocused.current = true;
    selectHit(focusHit);
  }, [focusHit, hits, selectHit]);

  // Your pin: only where you last shared your location (or where the phone says you are now).
  const mePos = where;

  // The still card in Find Players shows the city on your profile, the one you
  // picked at sign-up: never your live spot, and never a guess. No city, no map.
  const inCity = useMemo(() => (city ? ranked.filter((p) => milesBetween(city, p.at) <= IN_TOWN_MILES) : []), [city, ranked]);
  // Its courts, as dots: the same area (and the same cached answer) as Courts
  // near you under it, so the two agree and load once.
  const [cardCourtList, setCardCourtList] = useState<Court[]>(() => (card && city ? peekCourts(city) ?? [] : []));
  const cityLat = city?.lat;
  const cityLng = city?.lng;
  useEffect(() => {
    if (!card || cityLat === undefined || cityLng === undefined) return undefined;
    const at = { lat: cityLat, lng: cityLng };
    let on = true;
    const kept = peekCourts(at);
    if (kept) setCardCourtList(kept);
    fetchCourts(at).then((list) => { if (on) setCardCourtList(list); }).catch(() => undefined);
    return () => { on = false; };
  }, [card, cityLat, cityLng]);
  const cardCourts = useMemo(() => (card && city ? cardCourtList.slice(0, CARD_COURTS) : []), [card, city, cardCourtList]);
  // The hits near your city: the same distance as the Open hits list under
  // it, so the count there agrees with the list. Flags for the soonest few
  // only; a busy city's dozen would pile up over the card and its name.
  const cardHits = useMemo(() => (city ? hits.filter((h) => milesBetween(city, h.at) <= NEAR_HIT_MILES) : []), [city, hits]);
  const cardFlags = useMemo(() => cardHits.slice(0, CARD_FLAGS), [cardHits]);
  return {
    home, homeKnown, homeView, mePos, city, cityPending, inCity, start, ranked, inTown, filter, setFilter, query, setQuery, place, shown, selected, select,
    courtsOn, toggleCourts, courts: courtsOn && !card ? courts : [], courtsLoading, loadCourts, selectedCourt, selectCourt,
    cardCourts, cardHits, cardFlags, courtResults, pickCourt, hits, selectedHit, selectHit,
  };
}

export type MapModel = ReturnType<typeof useMapModel>;
