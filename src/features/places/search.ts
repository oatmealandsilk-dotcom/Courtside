import { searchPlaces } from '@/data/locations';
import type { LatLng } from '@/features/players/positions';

/** A place you could say a post was at: a city, a park, a club. */
export interface PlaceHit {
  /** What gets stored on the post: "Name, City" or "City, State". */
  value: string;
  title: string;
  /** Where that is, in a few words. */
  sub: string;
}

interface PhotonProps { name?: string; city?: string; state?: string; country?: string; countrycode?: string; osm_value?: string; type?: string }

/** Streets and single buildings are not places a post is "at". */
const SKIP = new Set(['house', 'street']);

/**
 * Places from the whole world, from Photon — OpenStreetMap's free search,
 * built for typing-as-you-go, no key, no account. Biased toward where you
 * are, so "Central" finds your Central Park before another city's. The
 * small local bank answers first, instantly, and stands in when offline.
 */
export async function searchPlacesRemote(query: string, near?: LatLng | null, signal?: AbortSignal): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const bias = near ? `&lat=${near.lat.toFixed(4)}&lon=${near.lng.toFixed(4)}` : '';
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=en${bias}`, { signal });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const json = (await res.json()) as { features?: { properties: PhotonProps }[] };
  const seen = new Set<string>();
  const out: PlaceHit[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (p.type && SKIP.has(p.type)) continue;
    const title = p.name ?? p.city;
    if (!title) continue;
    const parts = [p.city && p.city !== title ? p.city : null, p.state && p.state !== title ? p.state : null, p.countrycode === 'US' ? null : p.country].filter((x): x is string => !!x);
    const value = parts.length ? `${title}, ${parts[0]}` : title;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, title, sub: parts.join(', ') });
  }
  return out;
}

/** The local bank's answers, in the same shape, for the first instant and for offline. */
export function searchPlacesLocal(query: string): PlaceHit[] {
  return searchPlaces(query, 6).map((p) => ({ value: p.name, title: p.name.split(',')[0], sub: p.name.split(',').slice(1).join(',').trim() }));
}

const US_STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

/** A town anywhere, with where it is: what a profile's city is. */
export interface CityHit { name: string; lat: number; lng: number }

/**
 * Cities, towns and villages from Photon, so a profile can say Cary, NC or
 * any other town, not only the built-in list of big cities. US places read
 * "Town, ST"; elsewhere "Town, Country". Biased toward where you are.
 */
export async function searchCitiesRemote(query: string, near?: LatLng | null, signal?: AbortSignal): Promise<CityHit[]> {
  const q = query.split(',')[0].trim();
  if (q.length < 2) return [];
  const bias = near ? `&lat=${near.lat.toFixed(3)}&lon=${near.lng.toFixed(3)}` : '';
  const tags = ['place:city', 'place:town', 'place:village', 'place:suburb'].map((t) => `&osm_tag=${t}`).join('');
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en${tags}${bias}`, { signal });
  if (!res.ok) throw new Error(`cities ${res.status}`);
  const json = (await res.json()) as { features?: { properties: PhotonProps; geometry?: { coordinates?: [number, number] } }[] };
  const seen = new Set<string>();
  const out: CityHit[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    const at = f.geometry?.coordinates;
    if (!p.name || !at) continue;
    const region = p.countrycode === 'US' ? (p.state ? US_STATES[p.state] ?? p.state : null) : p.country;
    const name = region ? `${p.name}, ${region}` : p.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, lat: at[1], lng: at[0] });
  }
  return out;
}

/** Town names already asked for, by spot, for the session. */
const areas = new Map<string, Promise<string | null>>();

/**
 * The town a spot is in, the way a profile's city reads: "Town, ST" in the
 * US, "Town, Country" elsewhere. From Photon's reverse lookup, the same free
 * service the place picker uses. Null when it cannot say, or cannot be reached.
 */
export function areaOf(at: LatLng): Promise<string | null> {
  const key = `${at.lat.toFixed(3)},${at.lng.toFixed(3)}`;
  const known = areas.get(key);
  if (known) return known;
  const ask = (async () => {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${at.lat.toFixed(5)}&lon=${at.lng.toFixed(5)}&lang=en`);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { properties: PhotonProps & { district?: string; county?: string } }[] };
    const p = json.features?.[0]?.properties;
    const town = p?.city ?? p?.district ?? p?.county;
    if (!p || !town) return null;
    const region = p.countrycode === 'US' ? (p.state ? US_STATES[p.state] ?? p.state : null) : p.country;
    return region ? `${town}, ${region}` : town;
  })().catch(() => null);
  areas.set(key, ask);
  // A failed ask may be asked again next time.
  void ask.then((v) => { if (v === null) areas.delete(key); });
  return ask;
}
