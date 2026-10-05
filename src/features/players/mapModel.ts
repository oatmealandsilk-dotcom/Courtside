import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { nearestPlace, searchPlaces, type Place } from '@/data/locations';
import type { CourtRing, HitRequest, TaggedCourt, User } from '@/data/types';
import { NEAR_HIT_MILES, canSeeHitAt, hitSpot, openHits } from '@/features/hits/visible';
import { sameCourt } from '@/features/places/court';
import { looksPublic } from '@/features/places/courtName';
import { townNameAt } from '@/features/places/search';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { courtRows, fetchCourts, isClosedCourt, peekCourts, type Court, type CourtRow } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { homeFor, homeIsKnown, isRoughSpot, positionFor, wideView, type LatLng, type ViewBounds } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { isOpenToHit } from '@/features/players/openToHit';
import { show as showToast } from '@/lib/toast';

export type MapFilter = 'all' | 'following' | 'open' | 'near' | 'level' | 'coaches';
/**
 * A player set down on the map, with how far that is from you, and when
 * they were last there. `rough`: the pin is only about a kilometre out, so
 * distances to it are never said finer than that; `court`: the court they
 * were at, when the server put them on it (migration 63); `mutual`: a
 * friend who follows each other with you (migration 98), on the map at
 * any distance.
 */
export interface Placed { user: User; at: LatLng; miles: number; seenAt?: string; seenCity?: string; rough: boolean; court?: { id: string; name: string }; mutual?: boolean }
/** An open hit with a spot, for a flag on the map. */
export interface PlacedHit { hit: HitRequest; at: { id?: string; name: string; lat: number; lng: number } }

/** The still card's court dots: enough to say "there are courts here", not every one. */
const CARD_COURTS = 15;
/** The still card's hit flags: the soonest few; the line under the city counts the rest. */
const CARD_FLAGS = 3;
/**
 * Courts load for where the map comes to rest only this close in (a city or
 * nearer), and court pins show only this close in too (pinList): zoomed out
 * on a country, a few dozen pins would say nothing, every pan there would
 * ask again, and the map says "Zoom in to see courts" instead.
 */
export const COURTS_MIN_ZOOM = 10;

/** Inside this many miles someone counts as in your town. */
export const IN_TOWN_MILES = 30;
/** The tray lists people only this close (about 50 miles), unless you searched for someone or somewhere, or picked Following. */
const TRAY_MILES = 50;

/** The box court rings are asked for around a spot: about 10 miles each way, a town and its edges. */
export const ringBox = (at: LatLng) => ({ minLat: at.lat - 0.15, maxLat: at.lat + 0.15, minLng: at.lng - 0.2, maxLng: at.lng + 0.2 });

/** A ring as a court pin, for a court with one that the courts layer has not loaded (or with the layer off). */
const ringCourt = (r: CourtRing): Court => ({ id: r.courtId, name: r.name ?? 'Tennis courts', lat: r.lat, lng: r.lng, count: 1 });

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
export function useMapModel(me: User, players: User[], fix?: LatLng | null, focus?: TaggedCourt | null, card = false, focusHit?: string | null, focusUser?: string | null, focusSpot?: LatLng | null, locationOn = false) {
  const { lastSeen, actions, hitRequests, users, followingIds, currentUserId, blockedIds, mutedIds, courtRings, seeing } = useApp();
  // One stable function (it never changes), so asking for rings never repeats because something else did.
  const { loadCourtRings } = actions;
  // Your profile's city (and a typed town looked up by name, so nobody from a
  // smaller town lands in the wrong city, or off the map).
  const { city: profileCity, pending: profilePending, town } = useMyCity(me);
  // Where you really are comes first (Oct 2): with location on and a fix,
  // the still card is the town you are standing in, named after the nearest
  // place we know, or "you" when none is close. Location off: the city you
  // picked on your profile, as before.
  const fixLat = locationOn ? fix?.lat : undefined;
  const fixLng = locationOn ? fix?.lng : undefined;
  // The town's real name from the map search ("Wake Forest", Oct 3), not
  // the nearest big city the app happens to know; until it answers (or
  // offline), the nearest known city when one is close.
  const [townName, setTownName] = useState<{ key: string; name: string | null } | null>(null);
  const townKey = fixLat === undefined || fixLng === undefined ? '' : `${fixLat.toFixed(2)},${fixLng.toFixed(2)}`;
  useEffect(() => {
    if (!townKey || fixLat === undefined || fixLng === undefined) return undefined;
    let on = true;
    void townNameAt({ lat: fixLat, lng: fixLng }).then((name) => { if (on) setTownName({ key: townKey, name }); });
    return () => { on = false; };
  }, [townKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const looked = townName && townName.key === townKey ? townName.name : null;
  // While the app is young, the card is the big city you are near (Oct 3, owner's
  // call): Wake Forest and North Raleigh both read "Raleigh", centred on Raleigh,
  // counting everyone in town, so the map feels as full as it is. The small
  // towns still show as the map's own labels. Far from any big city the app
  // knows, it is the town you are in.
  const live = useMemo<{ at: LatLng; name: string } | null>(() => {
    if (fixLat === undefined || fixLng === undefined) return null;
    const at = { lat: fixLat, lng: fixLng };
    const place = nearestPlace(fixLat, fixLng);
    if (milesBetween(at, place) <= IN_TOWN_MILES) return { at: { lat: place.lat, lng: place.lng }, name: place.name.split(',')[0] };
    return { at, name: looked ?? 'you' };
  }, [fixLat, fixLng, looked]);
  const city = live ? live.at : profileCity;
  const cityPending = live ? false : profilePending;
  const cityName = live ? live.name : me.location.trim() ? me.location.split(',')[0] : 'you';
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
      .filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId, seeing }))
      .flatMap((hit) => { const at = hitSpot(hit); return at ? [{ hit, at }] : []; });
  }, [hitRequests, users, blockedIds, mutedIds, followingIds, currentUserId, seeing]);
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
  /** Where the map opens: a tagged court or a hit when one was tapped, a spot an alert named, else your town. */
  // Street level, close enough for the court names to show.
  const spotLat = focusSpot?.lat;
  const spotLng = focusSpot?.lng;
  const start = useMemo(() => (focus ? { center: { lat: focus.lat, lng: focus.lng }, zoom: 15 as number | null }
    : hitLat !== undefined && hitLng !== undefined ? { center: { lat: hitLat, lng: hitLng }, zoom: 14 as number | null }
      : spotLat !== undefined && spotLng !== undefined ? { center: { lat: spotLat, lng: spotLng }, zoom: 13 as number | null }
        : homeView), [focus, hitLat, hitLng, spotLat, spotLng, homeView]);
  // Each opening fetches where people were last seen round you, so the map is never a day old.
  useEffect(() => { void actions.loadLastSeen(); }, [actions.loadLastSeen]);
  // The full map also asks for who is in view as it comes to rest (migration
  // 63 answers for one part of the map at a time): the view and half of it
  // again all round, at most 2° each way, and only once the view has left
  // the part last asked for. Since migration 98 the server sends only
  // players near you from it, whatever part is asked for, and your friends
  // who follow each other with you in every answer, wherever they are: so
  // friends stay on the map at every zoom, and zooming out never shows
  // strangers further away.
  const lastArea = useRef<ViewBounds | null>(null);
  const loadPlayersIn = useCallback((b: ViewBounds) => {
    if (card) return;
    const last = lastArea.current;
    if (last && b.minLat >= last.minLat && b.maxLat <= last.maxLat && b.minLng >= last.minLng && b.maxLng <= last.maxLng) return;
    const midLat = (b.minLat + b.maxLat) / 2;
    const midLng = (b.minLng + b.maxLng) / 2;
    const hLat = Math.min(1, Math.max(0.01, b.maxLat - b.minLat));
    const hLng = Math.min(1, Math.max(0.01, b.maxLng - b.minLng));
    const area = { minLat: midLat - hLat, maxLat: midLat + hLat, minLng: midLng - hLng, maxLng: midLng + hLng };
    lastArea.current = area;
    void actions.loadLastSeen(area);
  }, [card, actions.loadLastSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo<Placed[]>(
    () => players
      .flatMap((user) => {
        const seen = lastSeen[user.id];
        const at = positionFor(user, seen);
        if (!at) return [];
        const court = seen?.place === 'court' && seen.courtId ? { id: seen.courtId, name: seen.courtName || 'Tennis courts' } : undefined;
        return [{ user, at, miles: milesBetween(home, at), seenAt: seen?.seenAt, seenCity: seen?.city, rough: isRoughSpot(seen), court, mutual: !!seen?.mutual }];
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
    const following = new Set(followingIds);
    return ranked.filter((p) => {
      if (filter === 'following' && !following.has(p.user.id)) return false;
      if (filter === 'open' && !isOpenToHit(p.user)) return false;
      if (filter === 'near' && p.miles > IN_TOWN_MILES) return false;
      if (filter === 'coaches' && !p.user.isCoach) return false;
      if (filter === 'level' && levelBadge(p.user.profile).tint !== myBand) return false;
      if (q && !(p.user.name.toLowerCase().includes(q) || p.user.handle.toLowerCase().includes(q) || p.user.location.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [ranked, filter, query, myBand, followingIds]);
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
  // Court rings: courts played on this week. They show with the courts layer
  // off too, and a ring the layer has not loaded brings its own pin; a ring
  // only ever sits on a real court, matched by id or by standing on it.
  const ringFor = useCallback((c: { id: string; lat: number; lng: number }) => courtRings.some((r) => sameCourt({ id: r.courtId, lat: r.lat, lng: r.lng }, c)), [courtRings]);
  const pins = useMemo<Court[]>(() => {
    const extra = courtRings.filter((r) => !courts.some((c) => sameCourt(c, { id: r.courtId, lat: r.lat, lng: r.lng }))).map(ringCourt);
    if (courtsOn) return [...courts, ...extra];
    return [...courts.filter((c) => ringFor(c)), ...extra];
  }, [courts, courtRings, courtsOn, ringFor]);
  const ringed = useMemo(() => new Set(pins.filter((c) => ringFor(c)).map((c) => c.id)), [pins, ringFor]);
  const selectedCourt = useMemo(() => pins.find((c) => c.id === selectedCourtId) ?? null, [pins, selectedCourtId]);
  const selectCourt = useCallback((id: string | null) => { setSelectedCourtId(id); if (id) { setSelectedId(null); setSelectedHitId(null); } }, []);
  // Read inside a load that finishes later: what is picked then, and the list it was picked from.
  const pickedCourt = useRef<string | null>(null);
  pickedCourt.current = selectedCourtId;
  const courtsNow = useRef<Court[]>(courts);
  courtsNow.current = courts;
  // Rings for where the map came to rest, whether or not the courts layer is on.
  const lastRingCentre = useRef<LatLng | null>(null);
  const loadRings = useCallback((centre: LatLng, zoom?: number) => {
    if (zoom !== undefined && zoom < COURTS_MIN_ZOOM) return;
    const last = lastRingCentre.current;
    if (last && milesBetween(last, centre) < 3) return;
    lastRingCentre.current = centre;
    void loadCourtRings(ringBox(centre)).catch(() => undefined);
  }, [loadCourtRings]);
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
      showToast({ title: 'Could not load courts', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' });
    } finally {
      setCourtsLoading(false);
      setCourtsLoads((n) => n + 1);
    }
  }, []);
  // The still card never loads the full pins (it would load them around your
  // live spot as well as the city, and draw both), and a map that only knows
  // a guessed city never loads courts there.
  useEffect(() => {
    if (card) return;
    const at = focus ?? hitAt ?? focusSpot ?? (homeKnown ? home : null);
    if (!at) return;
    loadRings(at);
    if (courtsOn) void loadCourts(at);
  }, [courtsOn, card, focus, hitAt, focusSpot, homeKnown, home, loadCourts, loadRings]);
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
  // The tray under the map: the people around you. In a town where nobody
  // shares yet it never lists players 2,000 miles away as "around" it; it
  // names the nearest courts instead. A search or Following lists everyone it finds.
  const tray = useMemo(() => (query.trim() || filter === 'following' ? shown : shown.filter((p) => p.miles <= TRAY_MILES)), [shown, query, filter]);

  const selectedHit = useMemo(() => hits.find((h) => h.hit.id === selectedHitId) ?? null, [hits, selectedHitId]);
  const selectHit = useCallback((id: string | null) => { setSelectedHitId(id); if (id) { setSelectedId(null); setSelectedCourtId(null); } }, []);
  // Opened on a player (?user=…, an alert that someone you follow is up for a hit): their card, once their pin is in.
  const userFocused = useRef(false);
  useEffect(() => {
    if (!focusUser || userFocused.current || !ranked.some((p) => p.user.id === focusUser)) return;
    userFocused.current = true;
    select(focusUser);
  }, [focusUser, ranked, select]);
  // Opened on a hit (?hit=…): its card comes up once it is in.
  const hitFocused = useRef(false);
  useEffect(() => {
    if (!focusHit || hitFocused.current || !hits.some((h) => h.hit.id === focusHit)) return;
    hitFocused.current = true;
    selectHit(focusHit);
  }, [focusHit, hits, selectHit]);

  // Your pin: only where you last shared your location (or where the phone says you are now).
  const mePos = where;

  // The still card in Find Players shows the town you are in when location is
  // on (see `live`), else the city on your profile. Never a guess. No city, no map.
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
  // The still card's rings: the city's courts played on this week.
  useEffect(() => {
    if (!card || cityLat === undefined || cityLng === undefined) return;
    void loadCourtRings(ringBox({ lat: cityLat, lng: cityLng })).catch(() => undefined);
  }, [card, cityLat, cityLng, loadCourtRings]);
  const cardRinged = useMemo(() => new Set(cardCourts.filter((c) => ringFor(c)).map((c) => c.id)), [cardCourts, ringFor]);
  /**
   * With nobody sharing nearby, the tray names the nearest few places anyone
   * may play in town: named ones only (three unnamed "Tennis courts" rows
   * tell nobody anything), those whose names read as public (a park, a rec
   * centre, a school) first, then the rest, nearest first within each. Only
   * a town with no named court at all lists unnamed ones, told apart by how far.
   */
  const nearestCourts = useMemo<CourtRow[]>(() => {
    const rows = courtRows(courts.filter((c) => !isClosedCourt(c)), home).filter((r) => r.miles <= IN_TOWN_MILES);
    const named = rows.filter((r) => r.c.name !== 'Tennis courts');
    const pool = named.length ? named : rows;
    return [...pool.filter((r) => looksPublic(r.c.name)), ...pool.filter((r) => !looksPublic(r.c.name))].slice(0, 3);
  }, [courts, home]);
  // The hits near your city: the same distance as the Open hits list under
  // it, so the count there agrees with the list. Flags for the soonest few
  // only; a busy city's dozen would pile up over the card and its name.
  const cardHits = useMemo(() => (city ? hits.filter((h) => milesBetween(city, h.at) <= NEAR_HIT_MILES) : []), [city, hits]);
  const cardFlags = useMemo(() => cardHits.slice(0, CARD_FLAGS), [cardHits]);
  return {
    home, homeKnown, homeView, mePos, city, cityName, cityPending, inCity, start, ranked, inTown, filter, setFilter, query, setQuery, place, shown, tray, selected, select, loadPlayersIn,
    courtsOn, toggleCourts, courts: card ? [] : pins, ringed, courtsLoading, loadCourts, loadRings, selectedCourt, selectCourt,
    cardCourts, cardRinged, cardHits, cardFlags, courtResults, pickCourt, hits, selectedHit, selectHit, nearestCourts,
  };
}

export type MapModel = ReturnType<typeof useMapModel>;
