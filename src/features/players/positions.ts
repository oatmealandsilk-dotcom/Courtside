import { PLACES, type Place } from '@/data/locations';
import type { LastSeen, User } from '@/data/types';

export interface LatLng { lat: number; lng: number; }

/** Stable 0–1 pair from a string, so a player always lands in the same spot. */
function spread(seed: string): { x: number; y: number } {
  let hash = 7;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 65521;
  return { x: (hash % 1000) / 1000 - 0.5, y: ((hash >> 4) % 1000) / 1000 - 0.5 };
}

/** Short names people type for a city in the bank. */
const ALIASES: Record<string, string> = { nyc: 'New York, NY', 'new york city': 'New York, NY', la: 'Los Angeles, CA', sf: 'San Francisco, CA', dc: 'Washington, DC', philly: 'Philadelphia, PA' };

/** Lower case with accents taken off, so "Sao Paulo" finds "São Paulo". */
const plain = (s: string) => (typeof s.normalize === 'function' ? s.normalize('NFD') : s).replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** The place bank entry for a "City, ST" string, if it is one we know. */
export function placeFor(location: string): Place | undefined {
  const wanted = plain(location);
  if (!wanted) return undefined;
  const alias = ALIASES[wanted];
  return PLACES.find((p) => plain(p.name) === wanted)
    ?? PLACES.find((p) => plain(p.name).split(',')[0] === wanted.split(',')[0].trim())
    ?? (alias ? PLACES.find((p) => p.name === alias) : undefined);
}

/**
 * States the bank has no city for, and the bank city nearest them — so
 * "Hoboken, NJ" starts the map by New York, not on the other coast.
 */
const NEAREST_FOR_STATE: Record<string, string> = {
  NJ: 'New York, NY', CT: 'New York, NY', DE: 'Philadelphia, PA', MD: 'Washington, DC', VA: 'Washington, DC',
  WV: 'Pittsburgh, PA', SC: 'Charlotte, NC', AL: 'Atlanta, GA', MS: 'Nashville, TN', KY: 'Cincinnati, OH',
  IN: 'Chicago, IL', WI: 'Chicago, IL', MO: 'Chicago, IL', IA: 'Minneapolis, MN', ND: 'Minneapolis, MN',
  SD: 'Minneapolis, MN', KS: 'Denver, CO', NE: 'Denver, CO', MT: 'Denver, CO', WY: 'Denver, CO',
  OK: 'Dallas, TX', AR: 'Dallas, TX', LA: 'Houston, TX', NM: 'Phoenix, AZ', ID: 'Salt Lake City, UT',
  NH: 'Boston, MA', VT: 'Boston, MA', ME: 'Boston, MA', AK: 'Seattle, WA', HI: 'Los Angeles, CA', AB: 'Vancouver, BC',
};

/** A city in the same state or country as the one typed, when the town itself is not in the bank. */
function regionFor(location: string): Place | undefined {
  const parts = location.split(',');
  if (parts.length < 2) return undefined;
  const code = parts[parts.length - 1].trim().toUpperCase();
  if (!code) return undefined;
  const named = NEAREST_FOR_STATE[code];
  return PLACES.find((p) => p.name.endsWith(`, ${code}`)) ?? (named ? PLACES.find((p) => p.name === named) : undefined);
}

/** Time zones not named after a city in the bank, and the bank city for them. */
const ZONE_CITY: Record<string, string> = {
  'America/Indiana/Indianapolis': 'Chicago, IL', 'America/Kentucky/Louisville': 'Cincinnati, OH', 'America/Boise': 'Salt Lake City, UT',
  'America/Anchorage': 'Seattle, WA', 'America/Edmonton': 'Vancouver, BC', 'America/Halifax': 'Boston, MA',
  'Asia/Kolkata': 'Mumbai, IN', 'Asia/Calcutta': 'Mumbai, IN', 'Asia/Qatar': 'Doha, QA',
};

/**
 * The device's time zone as a starting city: "America/New_York" is New
 * York. Nothing leaves the phone, and it is right about which part of the
 * world you are in, which is all a first view of the map needs.
 */
function placeForTimeZone(): Place | undefined {
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return undefined; }
  if (!zone) return undefined;
  const named = ZONE_CITY[zone];
  if (named) return PLACES.find((p) => p.name === named);
  const city = plain(zone.split('/').pop()!.replace(/_/g, ' '));
  return PLACES.find((p) => plain(p.name).split(',')[0] === city);
}

/**
 * Where to draw someone: near where they last had Location on, or else a
 * few streets from their profile city's centre — the same spot every time,
 * never tracked. Someone we know neither for is left off the map rather
 * than set down beside you, where they are not.
 */
export function positionFor(user: User, seen?: LastSeen): LatLng | null {
  const centre = seen ?? placeFor(user.location);
  if (!centre) return null;
  const { x, y } = spread(user.avatarSeed);
  // A last spot is already rounded to about a kilometre, so it only needs
  // nudging apart from its neighbours; a city centre spreads about ±3 km.
  // East–west is shrunk so the scatter stays round on the map.
  const reach = seen ? 0.008 : 0.05;
  return { lat: centre.lat + y * reach, lng: centre.lng + (x * reach) / Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180)) };
}

/** Whether the map knows where you are, or would only be guessing from the time zone. */
export function homeIsKnown(me: User, fix?: LatLng | null): boolean {
  return !!fix || !!placeFor(me.location) || !!regionFor(me.location);
}

/**
 * Your own spot: where the device says you are; else your profile's city,
 * or a city in the same state; else the city your phone's time zone is
 * named after; and only then Los Angeles.
 */
export function homeFor(me: User, fix?: LatLng | null): LatLng {
  if (fix) return fix;
  const place = placeFor(me.location) ?? regionFor(me.location) ?? placeForTimeZone() ?? PLACES[0];
  return { lat: place.lat, lng: place.lng };
}
