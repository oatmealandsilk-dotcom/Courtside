// CourtSide — tennis courts near a spot, from our own database.
//
// The app asks with {lat, lng, km}. Each square of the map (a quarter of a
// degree, about 25 km across) is fetched from OpenStreetMap once, every
// court in it is kept in public.courts, and later asks are answered from
// there; a square is re-checked after two months. Only a signed-in player
// (or the seeding token) can make the function go to OpenStreetMap; anyone
// else gets what is already stored.
//
// Deploy:   supabase functions deploy courts --no-verify-jwt
// Secrets:  COURTS_SEED_TOKEN   (optional — lets a script fill in many cities at once; unset it after)
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CELL = 0.25;
const FRESH_MS = 60 * 24 * 60 * 60 * 1000;
// The public query servers, tried in turn when one is busy.
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

interface Element { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; tags?: Record<string, string> }

/**
 * The query for one square: every tennis court in it, and every named place
 * a court can sit inside (a park, a school, a club, a neighbourhood), since
 * most courts carry no name of their own and the place around them does.
 */
export function squareQuery(box: string, timeout = 25) {
  const tennis = `["leisure"="pitch"]["sport"~"(^|;)tennis(;|$)"](${box})`;
  const places = [
    `["leisure"~"^(park|sports_centre|recreation_ground|stadium|golf_course|garden|nature_reserve|common)$"]["name"](${box})`,
    `["amenity"~"^(school|college|university|community_centre|social_facility|place_of_worship)$"]["name"](${box})`,
    `["club"]["name"](${box})`,
    `["landuse"~"^(residential|recreation_ground|education|religious)$"]["name"](${box})`,
    `["building"~"^(apartments|school|university)$"]["name"](${box})`,
  ];
  return `[out:json][timeout:${timeout}];(node${tennis};way${tennis};relation${tennis};way${places.join(';way')};relation${places.join(';relation')};);out tags bb;`;
}

/** Where a court or a place is: its point, or the middle of its outline. */
function spotOf(el: Element): { lat: number; lng: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  if (el.bounds) return { lat: (el.bounds.minlat + el.bounds.maxlat) / 2, lng: (el.bounds.minlon + el.bounds.maxlon) / 2 };
  return null;
}

/** How specific a surrounding place is: a club or a park names courts better than a whole neighbourhood. */
const placeRank = (tags: Record<string, string>) =>
  tags.club || tags.leisure === 'sports_centre' || tags.leisure === 'stadium' ? 0
  : tags.leisure ? 1
  : tags.amenity || tags.building ? 2
  : 3;

/** A court's own name only when it says more than "Court 3". */
const ownName = (tags?: Record<string, string>) => {
  const n = tags?.name?.trim();
  return n && !/^(tennis\s*)?courts?\s*#?\s*\d*[a-z]?$/i.test(n) ? n : null;
};

/** Trails and game lands are long or huge: a court inside their outline's box is rarely really in them. */
const tooLoose = (tags: Record<string, string>) => /greenway|trail\b|game land|state park|national|state forest/i.test(tags.name ?? '') && !tags.club;
/** Bigger than this (about 4 km², a club's golf course is allowed a little more), an outline's box says little about what is inside it. */
const maxArea = (rank: number) => (rank === 0 ? 0.0006 : 0.0004);

/** The name of the place a court sits in: the most specific, smallest one around it, else the nearest park or club within 250 m, or anything within 120 m. */
function nameFor(lat: number, lng: number, places: Element[]): string | null {
  let best: { name: string; rank: number; area: number } | null = null;
  for (const p of places) {
    const b = p.bounds;
    if (!b || lat < b.minlat || lat > b.maxlat || lng < b.minlon || lng > b.maxlon || tooLoose(p.tags!)) continue;
    const rank = placeRank(p.tags!);
    const area = (b.maxlat - b.minlat) * (b.maxlon - b.minlon);
    if (area > maxArea(rank)) continue;
    if (!best || rank < best.rank || (rank === best.rank && area < best.area)) best = { name: p.tags!.name, rank, area };
  }
  if (best) return best.name.slice(0, 160);
  let near: { name: string; d: number } | null = null;
  for (const p of places) {
    const c = spotOf(p);
    if (!c || tooLoose(p.tags!)) continue;
    const d = Math.hypot((c.lat - lat) * 111_000, (c.lng - lng) * 111_000 * Math.cos((lat * Math.PI) / 180));
    // A park or club a short walk away, or anything right next door.
    const reach = placeRank(p.tags!) <= 1 ? 250 : 120;
    if (d <= reach && (!near || d < near.d)) near = { name: p.tags!.name, d };
  }
  return near ? near.name.slice(0, 160) : null;
}

/** Fetches one square from OpenStreetMap and keeps every court in it. Says what went wrong, or null. */
async function syncCell(cell: string, until: number): Promise<string | null> {
  const [i, j] = cell.split(':').map(Number);
  const box = `${i * CELL},${j * CELL},${(i + 1) * CELL},${(j + 1) * CELL}`;
  const query = squareQuery(box);
  let elements: Element[] | null = null;
  const tried: string[] = [];
  for (const [n, url] of MIRRORS.entries()) {
    // The main server gets the longest; a backup only what is left of the time.
    const wait = Math.min(n === 0 ? 25000 : 12000, until - Date.now());
    if (wait < 3000) { tried.push('out of time'); break; }
    try {
      // The servers turn away anything that does not say what app is asking.
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json', 'user-agent': 'CourtSide/1.0 (https://courtsidebase.com; support@courtsidebase.com)' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(wait) });
      if (!res.ok) { tried.push(`${new URL(url).host} ${res.status}`); continue; }
      elements = ((await res.json()) as { elements?: Element[] }).elements ?? [];
      break;
    } catch (e) { tried.push(`${new URL(url).host} ${String(e).slice(0, 60)}`); }
  }
  if (!elements) return `no answer: ${tried.join('; ')}`;
  return await saveCell(cell, elements);
}

/** Keeps every court in one square, and notes the square as fetched. */
async function saveCell(cell: string, elements: Element[]): Promise<string | null> {
  const isCourt = (el: Element) => el.tags?.leisure === 'pitch' && /(^|;)tennis(;|$)/.test(el.tags?.sport ?? '');
  const places = elements.filter((el) => !isCourt(el) && el.tags?.name);
  const rows = elements.filter(isCourt).flatMap((el) => {
    const spot = spotOf(el);
    if (!spot || !['node', 'way', 'relation'].includes(el.type)) return [];
    const { lat, lng } = spot;
    return [{
      id: `${el.type}${el.id}`,
      // Its own name when it has a real one; else the park, school or club it sits in.
      name: ownName(el.tags)?.slice(0, 160) ?? nameFor(lat, lng, places),
      lat, lng,
      lit: el.tags?.lit === 'yes' ? true : el.tags?.lit === 'no' ? false : null,
      surface: el.tags?.surface?.slice(0, 40) ?? null,
      updated_at: new Date().toISOString(),
    }];
  });
  for (let k = 0; k < rows.length; k += 500) {
    const { error } = await admin.from('courts').upsert(rows.slice(k, k + 500));
    if (error) return `saving: ${error.message}`;
  }
  const { error } = await admin.from('court_areas').upsert({ cell, fetched_at: new Date().toISOString(), found: rows.length });
  return error ? `area: ${error.message}` : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'post only' }, 405);
  const body = await req.json().catch(() => ({})) as { lat?: number; lng?: number; km?: number; token?: string; cell?: string; elements?: Element[] };
  const seedToken = Deno.env.get('COURTS_SEED_TOKEN') ?? '';
  // The seeding script fetches squares itself and hands them over whole.
  if (seedToken && body.token === seedToken && typeof body.cell === 'string' && Array.isArray(body.elements)) {
    if (!/^-?[0-9]{1,3}:-?[0-9]{1,4}$/.test(body.cell)) return json({ error: 'cell?' }, 400);
    const problem = await saveCell(body.cell, body.elements.slice(0, 60000));
    return problem ? json({ error: problem }, 500) : json({ saved: body.elements.length });
  }
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return json({ error: 'where?' }, 400);
  const km = Math.min(25, Math.max(1, Number(body.km) || 9));

  // Only someone signed in (or the seeding script) sends the function to OpenStreetMap.
  let mayFetch = !!seedToken && body.token === seedToken;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!mayFetch && bearer) mayFetch = !!(await admin.auth.getUser(bearer)).data.user;

  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  let synced = 0;
  const problems: string[] = [];
  if (mayFetch) {
    const cells: string[] = [];
    for (let i = Math.floor((lat - dLat) / CELL); i <= Math.floor((lat + dLat) / CELL); i++) {
      for (let j = Math.floor((lng - dLng) / CELL); j <= Math.floor((lng + dLng) / CELL); j++) cells.push(`${i}:${j}`);
    }
    const { data: known } = await admin.from('court_areas').select('cell, fetched_at').in('cell', cells);
    const fresh = new Set((known ?? []).filter((a) => Date.now() - new Date(a.fetched_at).getTime() < FRESH_MS).map((a) => a.cell));
    // At most four squares a call, one after another, within a minute, so a
    // wide ask cannot flood the servers or keep the app waiting.
    const until = Date.now() + 60000;
    for (const cell of cells.filter((c) => !fresh.has(c)).slice(0, 4)) {
      if (until - Date.now() < 5000) break;
      const problem = await syncCell(cell, until);
      if (problem) problems.push(`${cell}: ${problem}`); else synced++;
    }
  }

  // The database hands back a thousand rows at a time; a big city has more.
  const courts: unknown[] = [];
  for (let from = 0; from < 4000; from += 1000) {
    const { data, error } = await admin.from('courts').select('id, name, lat, lng, lit, surface')
      .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lng', lng - dLng).lte('lng', lng + dLng)
      .order('id').range(from, from + 999);
    if (error) return json({ error: 'courts unavailable' }, 503);
    courts.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return json({ courts, synced, ...(problems.length ? { problems } : {}), ...(mayFetch ? {} : { stored: true }) });
});
