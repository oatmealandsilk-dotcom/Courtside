import { PLACES } from '@/data/locations';
import { US_STATES } from '@/features/places/search';
import { milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { plain, startsWord } from '@/features/search/words';

/**
 * A place the map's search found (Oct 5, owner: "I should be able to type an
 * address for searching courts", "search a location, like a city, and it
 * will take you there with courts popping up").
 */
export interface FoundPlace {
  /** Stable for a list: the map's own id for it, or a built-in city's name. */
  id: string;
  /** "Raleigh", "North Hills", "510 West Martin Street", "Pullen Park". */
  title: string;
  /** Where that is, in a few words: "NC", "Raleigh, NC", "Townsville, Australia". */
  sub: string;
  lat: number;
  lng: number;
  /**
   * 'area': a city, town, neighbourhood or county, whose courts are browsed
   * best first (rankForPlace in courts.ts). 'spot': an address, a street, a
   * park, a school: its courts are simply the nearest to it.
   */
  kind: 'area' | 'spot';
  /** About how far the place reaches from its middle, in miles (1 to 12). A spot's is 1. */
  reach: number;
}

/** What the open map search sends back, as far as this file reads it. */
interface PhotonProps {
  osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; type?: string;
  name?: string; housenumber?: string; street?: string; district?: string; city?: string; county?: string;
  state?: string; country?: string; countrycode?: string;
  /** The place's outline as a box: west, north, east, south. */
  extent?: [number, number, number, number];
}
interface PhotonFeature { properties: PhotonProps; geometry?: { coordinates?: [number, number] } }

/** Too big to look for courts in: the map would only say "Zoom in to see courts". */
const TOO_BIG = new Set(['state', 'country']);
/** Things on the map nobody plays near: stations, shops, offices, pylons. */
const NOT_PLACES = new Set(['railway', 'public_transport', 'shop', 'office', 'craft', 'power', 'aeroway', 'waterway', 'man_made', 'emergency', 'telecom', 'healthcare', 'historic']);
/** Of all the amenities on the map, only the ones that often have courts. */
const AMENITIES = new Set(['school', 'college', 'university', 'community_centre']);
/** A "place" on the map that is a whole area rather than one spot. */
const AREAS = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'borough', 'locality', 'municipality', 'county', 'city_district', 'district']);
/** How far an area reaches when the map gives no outline, in miles. */
const REACH: Record<string, number> = { city: 6, town: 3, borough: 3, municipality: 4, county: 12, suburb: 2, city_district: 2, district: 2, village: 1.5, quarter: 1, neighbourhood: 1, hamlet: 1, locality: 1 };

/** Words that already say a name is a road. */
const ROAD_WORDS = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|way|boulevard|blvd|court|ct|place|pl|parkway|pkwy|highway|hwy|circle|cir|trail|terrace|loop|row|path|pike)\b/i;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * About how far an area reaches from its middle: half the shorter side of
 * its outline's box (so a long thin town is not taken for a wide one),
 * between 1 and 12 miles.
 */
function reachOf(p: PhotonProps, lat: number): number {
  const box = p.extent;
  if (box && box.length === 4) {
    const wide = Math.abs(box[2] - box[0]) * 69.17 * Math.cos((lat * Math.PI) / 180);
    const tall = Math.abs(box[1] - box[3]) * 69;
    if (wide > 0 && tall > 0) return clamp(Math.min(wide, tall) / 2, 1, 12);
  }
  return REACH[p.osm_value ?? ''] ?? REACH[p.type ?? ''] ?? 2;
}

/** "NC" in the US (as profiles say it), the country elsewhere. */
const regionOf = (p: PhotonProps) => (p.countrycode === 'US' ? (p.state ? US_STATES[p.state] ?? p.state : undefined) : p.country);

/** One answer from the map search as a place for the list, or null for one the list should not offer. */
function toPlace(f: PhotonFeature): FoundPlace | null {
  const p = f.properties;
  const at = f.geometry?.coordinates;
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  const key = p.osm_key ?? '';
  if (TOO_BIG.has(p.type ?? '') || NOT_PLACES.has(key)) return null;
  if (key === 'amenity' && !AMENITIES.has(p.osm_value ?? '')) return null;
  // Retail parks and office blocks share a neighbourhood's name; a recreation ground is a place to play.
  if (key === 'landuse' && p.osm_value !== 'recreation_ground') return null;
  // A road is a street someone lives on; a bus stop on it is not a place.
  if (key === 'highway' && p.type !== 'street') return null;
  const lat = at[1];
  const lng = at[0];
  const address = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : undefined;
  const title = p.name ?? address ?? p.street;
  if (!title) return null;
  const area = (key === 'place' && AREAS.has(p.osm_value ?? '')) || key === 'boundary';
  // A spot says its town; an area says the city it is part of, if any (a city's own county reads oddly: "Raleigh, Wake").
  const town = area ? p.city : p.city ?? p.district ?? p.county;
  const region = regionOf(p);
  // A named spot at an address says the address first: "510 West Martin Street, Raleigh, NC".
  // A road whose name does not say it is one ("Raleigh", in Irvine) says so, so it is never taken for a town.
  const where = [p.name && address ? address : null, town && town !== title ? town : null, region && region !== title ? region : null]
    .filter((x): x is string => !!x).join(', ');
  const sub = key === 'highway' && !ROAD_WORDS.test(title) ? (where ? `Street · ${where}` : 'Street') : where;
  return {
    id: `${p.osm_type ?? ''}${p.osm_id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`}`,
    title, sub, lat, lng,
    kind: area ? 'area' : 'spot',
    reach: area ? reachOf(p, lat) : 1,
  };
}

/** The same place twice (a park and its outline, a city and its boundary): the same name within a mile, or the same name and region. */
function samePlace(a: FoundPlace, b: FoundPlace): boolean {
  if (plain(a.title) !== plain(b.title)) return false;
  return plain(a.sub) === plain(b.sub) || milesBetween(a, b) < 1;
}

/** Places to the list, each once, in the order given. */
export function mergePlaces(...lists: FoundPlace[][]): FoundPlace[] {
  const out: FoundPlace[] = [];
  for (const list of lists) for (const p of list) if (!out.some((kept) => samePlace(kept, p))) out.push(p);
  return out;
}

/**
 * The bias sent with a search: only a rough area, rounded to a tenth of a
 * degree (about 7 miles), so the search leans toward your part of the world
 * ("Springfield" near you before one across the country) without ever being
 * told where you are to the street.
 */
export const roughBias = (at: LatLng) => ({ lat: Math.round(at.lat * 10) / 10, lng: Math.round(at.lng * 10) / 10 });

/** Every answer already had this session, by what was typed and the rough area. */
const answered = new Map<string, FoundPlace[]>();
export const answerKey = (text: string, near: LatLng | null) => {
  const bias = near ? roughBias(near) : null;
  return `${plain(text)}|${bias ? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}` : ''}`;
};
/** An answer already had for this search, without asking again. */
export const keptPlaces = (text: string, near: LatLng | null) => answered.get(answerKey(text, near));

/**
 * Cities, neighbourhoods, addresses and parks from Photon, OpenStreetMap's
 * free search built for typing as you go (the one Add location and the
 * profile's city already use): no key, no account, the same answer on a
 * phone and in a browser. Only what was typed and a rough area (roughBias)
 * leave the phone. States and countries are left out (too big to show
 * courts in), and so are stations, shops and offices.
 */
export async function searchMapPlaces(text: string, near: LatLng | null, signal?: AbortSignal): Promise<FoundPlace[]> {
  const q = text.trim();
  if (plain(q).length < 2) return [];
  const key = answerKey(q, near);
  const kept = answered.get(key);
  if (kept) return kept;
  const bias = near ? roughBias(near) : null;
  // zoom=10: lean toward a city's worth around the rough area, not the street it is rounded to.
  // location_bias_scale=0.5: how well known a place is still counts for half, so "Raleigh"
  // typed in Los Angeles is the city in North Carolina, not Raleigh Street in Glendale,
  // while "Pullen Park" or "123 Main St" stay the nearby ones (tried Oct 5).
  const lean = bias ? `&lat=${bias.lat.toFixed(1)}&lon=${bias.lng.toFixed(1)}&zoom=10&location_bias_scale=0.5` : '';
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en${lean}`, { signal });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  const out = mergePlaces((json.features ?? []).flatMap((f) => { const p = toPlace(f); return p ? [p] : []; }));
  answered.set(key, out);
  return out;
}

/**
 * The built-in list of big cities, for the first instant and for when the
 * search cannot be reached: a city whose name has a word starting with what
 * was typed, nearest first, a few at most; for two letters only those within
 * a couple of hours' drive ("ra" is Raleigh, not Rabat).
 */
export function localPlaces(text: string, near: LatLng | null, limit = 3): FoundPlace[] {
  const words = plain(text).split(' ').filter(Boolean);
  if (!words.length || words.join('').length < 2) return [];
  const away = (p: { lat: number; lng: number }) => (near ? milesBetween(near, p) : 0);
  return PLACES
    .filter((p) => startsWord(plain(p.name.split(',')[0]), words[0]) && words.every((w) => startsWord(plain(p.name), w)))
    .filter((p) => words.join('').length >= 3 || !near || away(p) <= 150)
    .sort((a, b) => away(a) - away(b))
    .slice(0, limit)
    .map((p) => ({
      id: `city:${p.name}`,
      title: p.name.split(',')[0].trim(),
      sub: p.name.split(',').slice(1).join(',').trim(),
      lat: p.lat, lng: p.lng, kind: 'area' as const, reach: REACH.city,
    }));
}

/**
 * How close the map goes in on a place: close enough that court pins show
 * (never below the zoom they appear at), wide enough to see an area whole.
 * A spot: street level, with a mile or so either side, so the nearest
 * courts are in view. An area: about its own size on screen, from 13.5 for
 * a neighbourhood to 10.5 for a big city.
 */
export function placeZoom(place: Pick<FoundPlace, 'kind' | 'reach'>, courtsFrom: number): number {
  if (place.kind === 'spot') return 13.5;
  return clamp(13.5 - Math.log2(Math.max(1, place.reach)), courtsFrom + 0.5, 13.5);
}

/** A place picked somewhere else (Find Players' search), on its way to the full map. */
let handed: FoundPlace | null = null;
/** Hands a place to the full map, which reads it as it opens (app/map, only when opened with ?place=1). */
export function handPlace(place: FoundPlace) { handed = place; }
/** The place last handed over: only a map opened with ?place=1 asks, and each pick hands a new one first. */
export function takeHandedPlace(): FoundPlace | null { return handed; }
