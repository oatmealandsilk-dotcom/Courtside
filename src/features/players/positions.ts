import { PLACES, type Place } from '@/data/locations';
import type { User } from '@/data/types';

export interface LatLng { lat: number; lng: number; }

/** Stable 0–1 pair from a string, so a player always lands in the same spot. */
function spread(seed: string): { x: number; y: number } {
  let hash = 7;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 65521;
  return { x: (hash % 1000) / 1000 - 0.5, y: ((hash >> 4) % 1000) / 1000 - 0.5 };
}

/** The place bank entry for a "City, ST" string, if it is one we know. */
export function placeFor(location: string): Place | undefined {
  const wanted = location.trim().toLowerCase();
  if (!wanted) return undefined;
  return PLACES.find((p) => p.name.toLowerCase() === wanted)
    ?? PLACES.find((p) => p.name.toLowerCase().split(',')[0] === wanted.split(',')[0]);
}

/**
 * Where to draw someone. Profiles only say a city, so each player is set down
 * at a fixed spot a few streets from that city's centre — the same spot every
 * time — rather than tracked. Someone whose city we do not know is placed
 * near you.
 */
export function positionFor(user: User, home: LatLng): LatLng {
  const centre = placeFor(user.location) ?? home;
  const { x, y } = spread(user.avatarSeed);
  // About ±3 km, shrunk east–west so the scatter stays round on the map.
  return { lat: centre.lat + y * 0.05, lng: centre.lng + (x * 0.05) / Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180)) };
}

/** Your own spot: the centre of your city, or Los Angeles until you set one. */
export function homeFor(me: User, fix?: LatLng | null): LatLng {
  if (fix) return fix;
  const place = placeFor(me.location) ?? PLACES[0];
  return { lat: place.lat, lng: place.lng };
}
