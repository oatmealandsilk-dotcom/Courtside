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
