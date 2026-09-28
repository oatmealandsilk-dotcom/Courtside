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
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

interface Element { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

/** Fetches one square from OpenStreetMap and keeps every court in it. False when no server answered. */
async function syncCell(cell: string): Promise<boolean> {
  const [i, j] = cell.split(':').map(Number);
  const box = `${i * CELL},${j * CELL},${(i + 1) * CELL},${(j + 1) * CELL}`;
  const tennis = `["leisure"="pitch"]["sport"~"(^|;)tennis(;|$)"](${box})`;
  const query = `[out:json][timeout:25];(node${tennis};way${tennis};relation${tennis};);out center tags;`;
  let elements: Element[] | null = null;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      elements = ((await res.json()) as { elements?: Element[] }).elements ?? [];
      break;
    } catch { /* the next server */ }
  }
  if (!elements) return false;
  const rows = elements.flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined || !['node', 'way', 'relation'].includes(el.type)) return [];
    return [{
      id: `${el.type}${el.id}`,
      name: el.tags?.name?.slice(0, 160) ?? null,
      lat, lng,
      lit: el.tags?.lit === 'yes' ? true : el.tags?.lit === 'no' ? false : null,
      surface: el.tags?.surface?.slice(0, 40) ?? null,
      updated_at: new Date().toISOString(),
    }];
  });
  for (let k = 0; k < rows.length; k += 500) {
    const { error } = await admin.from('courts').upsert(rows.slice(k, k + 500));
    if (error) return false;
  }
  await admin.from('court_areas').upsert({ cell, fetched_at: new Date().toISOString(), found: rows.length });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'post only' }, 405);
  const body = await req.json().catch(() => ({})) as { lat?: number; lng?: number; km?: number; token?: string };
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return json({ error: 'where?' }, 400);
  const km = Math.min(25, Math.max(1, Number(body.km) || 9));

  // Only someone signed in (or the seeding script) sends the function to OpenStreetMap.
  const seedToken = Deno.env.get('COURTS_SEED_TOKEN') ?? '';
  let mayFetch = !!seedToken && body.token === seedToken;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!mayFetch && bearer) mayFetch = !!(await admin.auth.getUser(bearer)).data.user;

  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  let synced = 0;
  if (mayFetch) {
    const cells: string[] = [];
    for (let i = Math.floor((lat - dLat) / CELL); i <= Math.floor((lat + dLat) / CELL); i++) {
      for (let j = Math.floor((lng - dLng) / CELL); j <= Math.floor((lng + dLng) / CELL); j++) cells.push(`${i}:${j}`);
    }
    const { data: known } = await admin.from('court_areas').select('cell, fetched_at').in('cell', cells);
    const fresh = new Set((known ?? []).filter((a) => Date.now() - new Date(a.fetched_at).getTime() < FRESH_MS).map((a) => a.cell));
    // At most four squares a call, one after another, so a wide ask cannot flood the servers.
    for (const cell of cells.filter((c) => !fresh.has(c)).slice(0, 4)) if (await syncCell(cell)) synced++;
  }

  const { data, error } = await admin.from('courts').select('id, name, lat, lng, lit, surface')
    .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lng', lng - dLng).lte('lng', lng + dLng)
    .order('id').limit(1500);
  if (error) return json({ error: 'courts unavailable' }, 503);
  return json({ courts: data ?? [], synced });
});
