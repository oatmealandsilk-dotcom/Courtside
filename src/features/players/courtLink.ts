import { useCallback, useEffect, useRef } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';

import { sameCourt } from '@/features/places/court';

/** A court to open: the map's id when there is one, its name and its spot. */
type Spot = { id?: string; name: string; lat: number; lng: number };

/** The court page's address. Every link to it is built here, so the same court always has the same address. */
export function courtParams(court: Spot) {
  return { id: court.id || 'near', name: court.name, lat: court.lat.toFixed(5), lng: court.lng.toFixed(5) };
}
export const courtHref = (court: Spot): Href => ({ pathname: '/court/[id]', params: courtParams(court) });
/** The court's posts as a full-screen reel, starting on one of them. */
export const courtReelHref = (court: Spot, postId: string): Href => ({ pathname: '/court/[id]/reel', params: { ...courtParams(court), post: postId } });
const mapHref = (court: Spot): Href => ({ pathname: '/map', params: { court: court.id || 'near', lat: String(court.lat), lng: String(court.lng), name: court.name } });

/*
 * Court pages and court maps that are open, in the order they opened, so a
 * tap that would stack a second copy of one goes back to it instead:
 * page → reel → the court's name on a clip comes back to the page, and
 * page → map → "See all" on the court's card comes back to the page.
 * Only the newest of each kind is gone back to; the router goes back to the
 * newest screen of that kind, so an older one is opened afresh instead.
 */
type Kind = 'page' | 'map';
interface Open { kind: Kind; place: { id?: string; lat: number; lng: number }; href: Href; focused: { current: boolean } }
const opened: Open[] = [];
const newest = (kind: Kind) => {
  for (let i = opened.length - 1; i >= 0; i -= 1) if (opened[i].kind === kind) return opened[i];
  return null;
};

/** A court page or a court map says it is open (and when it is the screen in front), for the taps below. */
export function useCourtOpen(kind: Kind, place: { id?: string; lat: number; lng: number } | null, href: Href | null) {
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  const key = place ? `${place.id ?? ''}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}` : '';
  const hrefRef = useRef(href);
  hrefRef.current = href;
  useEffect(() => {
    const at = hrefRef.current;
    if (!place || !at) return undefined;
    const entry: Open = { kind, place: { id: place.id, lat: place.lat, lng: place.lng }, href: at, focused };
    opened.push(entry);
    return () => { const i = opened.indexOf(entry); if (i >= 0) opened.splice(i, 1); };
  }, [kind, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * A court's own page: what has been posted there, what players say about it,
 * directions. Already in front, nothing happens; open just beneath (under its
 * reel, or under the map it opened), it goes back there.
 */
export function openCourt(court: Spot) {
  const top = newest('page');
  if (top && sameCourt(court, top.place)) {
    if (!top.focused.current) router.dismissTo(top.href);
    return;
  }
  router.push(courtHref(court));
}

/** A court's posts as a reel, starting on the one tapped. */
export function openCourtReel(court: Spot, postId: string) {
  router.push(courtReelHref(court, postId));
}

/** A court on the map, with its card up; if that map is already open beneath, back to it. */
export function showCourtOnMap(court: Spot) {
  const top = newest('map');
  if (top && sameCourt(court, top.place) && !top.focused.current) { router.dismissTo(top.href); return; }
  router.push(mapHref(court));
}

/**
 * "Play here": the hit form with this court already chosen as where, so
 * posting a hit from a court's page or card keeps that court (its id too,
 * which puts the hit on the court's page).
 */
export const playHereHref = (court: Spot): Href => ({
  pathname: '/hit-request/new',
  params: { courtId: court.id || 'near', courtName: court.name, lat: court.lat.toFixed(5), lng: court.lng.toFixed(5) },
});
export function playHere(court: Spot) {
  router.push(playHereHref(court));
}

/** "Post from here": a new post or clip with this court already tagged. Only a court with the map's id can be tagged. */
export function postFromCourt(court: Spot & { id: string }) {
  router.push({ pathname: '/compose', params: { courtId: court.id, courtName: court.name, lat: court.lat.toFixed(5), lng: court.lng.toFixed(5) } });
}

/** A court into any of your chats ("meet here"), with its id, so the chat's card opens this same court's page. */
export function sendCourtToChat(court: Spot) {
  router.push({ pathname: '/share', params: { kind: 'court', id: court.id ?? '', name: court.name, lat: String(court.lat), lng: String(court.lng) } });
}
