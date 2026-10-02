import { supabase } from '@/lib/supabase';
import { demoCourtsNamed, demoCourtsNear } from '@/data/mock/courts';
import type { CourtAccess } from '@/data/types';
import { milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { plain } from '@/features/search/words';
// The courts function's own reading of a court's map tags, so a court
// fetched straight from OpenStreetMap is read the same way as a stored one.
import { courtTagFacts } from '../../../supabase/functions/courts/tags';

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
  /**
   * Who may play there (migration 60): absent, or 'unknown', when nobody
   * has said. Members-only and private courts are greyed and never suggested.
   */
  access?: CourtAccess;
  fee?: boolean;
  indoor?: boolean;
  /** A booking or website link, from the map data or an admin, never from a player. */
  bookUrl?: string;
}

/** Members only, or someone's own court: shown greyed, never suggested for a hit or in Courts near you. */
export const isClosedCourt = (c: { access?: CourtAccess }) => c.access === 'members' || c.access === 'private';

/** One court as stored: our own database's row, or OpenStreetMap's answer turned into one. The access columns arrive only from a database with migration 60. */
interface Row {
  id: string; name: string | null; lat: number; lng: number; lit: boolean | null; surface: string | null;
  access?: CourtAccess | null; fee?: boolean | null; indoor?: boolean | null; book_url?: string | null;
}
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

/** The courts around a spot if they are already on the phone, without waiting: a page can open on a full list. */
export function peekCourts(center: LatLng, radiusMeters = 9000): Court[] | undefined {
  return cache.get(`${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusMeters}`);
}

async function loadCourts(center: LatLng, radiusMeters: number, key: string): Promise<Court[]> {
  let rows: Row[] | null = null;
  // The demo (no database) has its own made-up parks around its city, so the
  // courts never depend on the internet there; anywhere else it asks OpenStreetMap.
  if (!supabase) { const demo = demoCourtsNear(center, radiusMeters); if (demo.length) rows = demo; }
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
    // Who may play there, as the map's tags say: a backyard or club court is greyed here too.
    const facts = courtTagFacts(el.tags);
    return [{ id: `${el.type}${el.id}`, name: el.tags?.name ?? null, lat, lng, lit: el.tags?.lit === 'yes' ? true : null, surface: el.tags?.surface ?? null, access: facts.osm_access, fee: facts.fee, indoor: facts.indoor, book_url: facts.book_url }];
  });
}

/**
 * Courts a few hundred feet apart are one facility, so they fold into one
 * pin with a count, nearest first. Rows are taken in id order, so the same
 * court always stands for its park — and players' notes stay attached to it.
 * The map's own areas keep the nearest 80 pins; a wider ask (the ~15 miles
 * that searching and Add location look through) keeps every facility, or a
 * park across town would never be found by name.
 */
function fold(rows: Row[], center: LatLng, radiusMeters: number, cap = radiusMeters > 9000 ? 600 : 80): Court[] {
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
    // Who may play there comes with the court whose id the pin stands under: players' answers are saved against it.
    groups.set(cell, {
      id: row.id, name: row.name ?? 'Tennis courts', lat: row.lat, lng: row.lng, count: 1, lit: row.lit ?? undefined, surface: row.surface ?? undefined,
      ...(row.access && row.access !== 'unknown' ? { access: row.access } : {}),
      ...(typeof row.fee === 'boolean' ? { fee: row.fee } : {}),
      ...(typeof row.indoor === 'boolean' ? { indoor: row.indoor } : {}),
      ...(row.book_url ? { bookUrl: row.book_url } : {}),
    });
  }
  const reach = radiusMeters / 1609.34;
  return [...groups.values()]
    .map((c) => ({ c, miles: milesBetween(center, c) }))
    .filter((x) => x.miles <= reach)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, cap)
    .map((x) => x.c);
}

/** A court with how far it is from you, for a list. */
export interface CourtRow { c: Court; miles: number }

/**
 * Courts as a list reads them: nearest first, and one row per place. A big
 * park's courts can land in a few neighbouring cells, which would put
 * "Millbrook Exchange Park" in four rows; the same name within about a mile
 * and a half is one row, the nearest, with the courts added up. Unnamed
 * courts are each their own place.
 */
export function courtRows(courts: Court[], from: LatLng | null): CourtRow[] {
  const sorted = courts
    .map((c) => ({ c, miles: from ? milesBetween(from, c) : 0 }))
    .sort((a, b) => a.miles - b.miles);
  const out: CourtRow[] = [];
  const byName = new Map<string, CourtRow[]>();
  const seen = new Set<string>();
  for (const row of sorted) {
    if (seen.has(row.c.id)) continue;
    seen.add(row.c.id);
    if (row.c.name === 'Tennis courts') { out.push(row); continue; }
    const name = plain(row.c.name);
    const same = byName.get(name)?.find((kept) => milesBetween(kept.c, row.c) <= 1.5);
    if (same) {
      same.c = { ...same.c, count: same.c.count + row.c.count, lit: same.c.lit || row.c.lit || undefined };
      continue;
    }
    const kept = { ...row };
    out.push(kept);
    byName.set(name, [...(byName.get(name) ?? []), kept]);
  }
  return out;
}

const named = new Map<string, Court[]>();
const BASE_COLUMNS = 'id,name,lat,lng,lit,surface';
const ACCESS_COLUMNS = 'access,fee,indoor,book_url';
/** Set once the courts table turns out to have no access columns (a database before migration 60). */
let noAccessColumns = false;

/**
 * Courts anywhere within about 140 miles whose name has a word starting
 * with the first word typed ("god" finds Robert V. Godbold Park), from our
 * own database, for a place beyond the courts already on the phone. Two
 * letters at least: one letter matches a thousand courts. Answers are kept
 * for the session. The demo searches its own made-up parks.
 */
export async function searchCourtsByName(text: string, near: LatLng, signal?: AbortSignal): Promise<Court[]> {
  // Only letters, digits, apostrophes and hyphens reach the query, so nothing typed can change its meaning.
  const word = (plain(text).split(' ')[0] ?? '').replace(/[^\p{L}\p{N}'-]/gu, '');
  if (word.length < 2) return [];
  // The demo looks through its own made-up parks.
  if (!supabase) return fold(demoCourtsNamed(word), near, 300000);
  const key = `${word}|${near.lat.toFixed(1)},${near.lng.toFixed(1)}`;
  const kept = named.get(key);
  if (kept) return kept;
  const db = supabase;
  const ask = (columns: string) => {
    let q = db
      .from('courts')
      .select(columns)
      .gte('lat', near.lat - 2).lte('lat', near.lat + 2)
      .gte('lng', near.lng - 2.5).lte('lng', near.lng + 2.5)
      .or(`name.ilike."${word}%",name.ilike."% ${word}%"`)
      .limit(500);
    if (signal) q = q.abortSignal(signal);
    return q;
  };
  let { data, error } = await ask(noAccessColumns ? BASE_COLUMNS : `${BASE_COLUMNS},${ACCESS_COLUMNS}`);
  // A database before migration 60 has no access columns: ask without them from now on.
  if (error && !noAccessColumns && /access|book_url|indoor|\bfee\b/.test(error.message)) {
    noAccessColumns = true;
    ({ data, error } = await ask(BASE_COLUMNS));
  }
  if (error) throw error;
  const out = fold((data ?? []) as unknown as Row[], near, 300000);
  named.set(key, out);
  return out;
}
