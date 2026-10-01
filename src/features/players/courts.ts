import { supabase } from '@/lib/supabase';
import { milesBetween } from '@/features/players/geo';
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

/** One court as stored: our own database's row, or OpenStreetMap's answer turned into one. */
interface Row { id: string; name: string | null; lat: number; lng: number; lit: boolean | null; surface: string | null }
interface Element { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const cache = new Map<string, Court[]>();
const inFlight = new Map<string, Promise<Court[]>>();

/**
 * Courts around a spot. Signed in, they come from our own database through
 * the "courts" function, which fetches an area from OpenStreetMap the first
 * time anyone looks there and keeps it (migration 47). Otherwise, or if the
 * function cannot be reached, straight from OpenStreetMap's free query
 * service. Cached per area for the session.
 */
export function fetchCourts(center: LatLng, radiusMeters = 9000): Promise<Court[]> {
  const key = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusMeters}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  // Two screens asking for the same area at once share one request.
  const asked = inFlight.get(key);
  if (asked) return asked;
  const ask = loadCourts(center, radiusMeters, key).finally(() => inFlight.delete(key));
  inFlight.set(key, ask);
  return ask;
}

async function loadCourts(center: LatLng, radiusMeters: number, key: string): Promise<Court[]> {
  let rows: Row[] | null = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke<{ courts?: Row[] }>('courts', { body: { lat: center.lat, lng: center.lng, km: radiusMeters / 1000 } });
      if (!error && data?.courts) rows = data.courts;
    } catch { /* straight to OpenStreetMap below */ }
  }
  // Nothing stored yet for a place nobody signed in has opened: ask OpenStreetMap directly.
  if (!rows || !rows.length) rows = await fromOpenStreetMap(center, radiusMeters);
  const out = fold(rows, center, radiusMeters);
  cache.set(key, out);
  return out;
}

async function fromOpenStreetMap(center: LatLng, radiusMeters: number): Promise<Row[]> {
  const around = `(around:${radiusMeters},${center.lat},${center.lng})`;
  const query = `[out:json][timeout:12];(node["leisure"="pitch"]["sport"="tennis"]${around};way["leisure"="pitch"]["sport"="tennis"]${around};);out center 200;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`courts ${res.status}`);
  const json = (await res.json()) as { elements?: Element[] };
  return (json.elements ?? []).flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) return [];
    return [{ id: `${el.type}${el.id}`, name: el.tags?.name ?? null, lat, lng, lit: el.tags?.lit === 'yes' ? true : null, surface: el.tags?.surface ?? null }];
  });
}

/**
 * Courts a few hundred feet apart are one facility, so they fold into one
 * pin with a count, nearest first. Rows are taken in id order, so the same
 * court always stands for its park — and players' notes stay attached to it.
 */
function fold(rows: Row[], center: LatLng, radiusMeters: number): Court[] {
  const groups = new Map<string, Court>();
  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    // ~250 m cells: the courts of one park land in the same cell.
    const cell = `${Math.round(row.lat / 0.0022)},${Math.round(row.lng / 0.003)}`;
    const have = groups.get(cell);
    if (have) {
      have.count += 1;
      if (row.name && have.name === 'Tennis courts') have.name = row.name;
      if (row.lit) have.lit = true;
      if (!have.surface && row.surface) have.surface = row.surface;
      continue;
    }
    groups.set(cell, { id: row.id, name: row.name ?? 'Tennis courts', lat: row.lat, lng: row.lng, count: 1, lit: row.lit ?? undefined, surface: row.surface ?? undefined });
  }
  const reach = radiusMeters / 1609.34;
  return [...groups.values()]
    .map((c) => ({ c, miles: milesBetween(center, c) }))
    .filter((x) => x.miles <= reach)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 80)
    .map((x) => x.c);
}
