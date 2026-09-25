import type { LatLng } from '@/features/players/positions';

/** A public tennis court, as OpenStreetMap knows it. */
export interface Court {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** How many courts stand together here. */
  count: number;
  lit?: boolean;
  surface?: string;
}

interface Element { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const cache = new Map<string, Court[]>();

/**
 * Courts around a spot, from OpenStreetMap's free query service (no key,
 * no account). Courts a few hundred feet apart are one facility, so they
 * are folded into one pin with a count. Cached per area for the session.
 */
export async function fetchCourts(center: LatLng, radiusMeters = 9000): Promise<Court[]> {
  const key = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusMeters}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const around = `(around:${radiusMeters},${center.lat},${center.lng})`;
  const query = `[out:json][timeout:12];(node["leisure"="pitch"]["sport"="tennis"]${around};way["leisure"="pitch"]["sport"="tennis"]${around};);out center 120;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`courts ${res.status}`);
  const json = (await res.json()) as { elements?: Element[] };
  const groups = new Map<string, Court>();
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    // ~250 m cells: the courts of one park land in the same cell.
    const cell = `${Math.round(lat / 0.0022)},${Math.round(lng / 0.003)}`;
    const name = el.tags?.name;
    const have = groups.get(cell);
    if (have) {
      have.count += 1;
      if (name && have.name === 'Tennis courts') have.name = name;
      continue;
    }
    groups.set(cell, { id: `${el.type}${el.id}`, name: name ?? 'Tennis courts', lat, lng, count: 1, lit: el.tags?.lit === 'yes', surface: el.tags?.surface });
  }
  const out = [...groups.values()].slice(0, 60);
  cache.set(key, out);
  return out;
}
