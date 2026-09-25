// CourtSide ↔ WHOOP — a Supabase Edge Function.
//
// The app never holds WHOOP's client secret. Four jobs, by path:
//   /start      — (signed-in) sends the browser to WHOOP to say yes
//   /callback   — WHOOP sends the browser back here; the code becomes tokens,
//                 the last week is pulled, and the browser returns to the app
//   /sync       — (signed-in) pulls the last week again
//   /disconnect — (signed-in) forgets the tokens
//
// Deploy:   supabase functions deploy whoop --no-verify-jwt
//           (the callback is opened by WHOOP's redirect, with no app token;
//            /start, /sync and /disconnect check the person's token themselves)
// Secrets:  supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=...
// WHOOP app: redirect URL = https://<project>.supabase.co/functions/v1/whoop/callback
//            scopes = read:recovery read:sleep read:cycles read:profile offline
import { createClient } from 'npm:@supabase/supabase-js@2';

const AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer/v2';
const SCOPES = 'read:recovery read:sleep read:cycles read:profile offline';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const clientId = Deno.env.get('WHOOP_CLIENT_ID') ?? '';
const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET') ?? '';
const redirectUri = `${url}/functions/v1/whoop/callback`;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Who is asking, from the app's own token. */
async function whoIs(req: Request): Promise<string | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return null;
  const { data } = await admin.auth.getUser(bearer);
  return data.user?.id ?? null;
}

/** The state that travels through WHOOP and back: who, and where to return, signed so nobody can forge it. */
const key = crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function sign(payload: object) { const body = b64(new TextEncoder().encode(JSON.stringify(payload))); const mac = b64(await crypto.subtle.sign('HMAC', await key, new TextEncoder().encode(body))); return `${body}.${mac}`; }
async function open(state: string): Promise<{ uid: string; back: string } | null> {
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;
  const ok = await crypto.subtle.verify('HMAC', await key, unb64(mac), new TextEncoder().encode(body));
  return ok ? JSON.parse(new TextDecoder().decode(unb64(body))) : null;
}
/** Only the app's own addresses may be returned to. */
const safeBack = (back: string) => /^(courtside:\/\/|exp:\/\/|exps:\/\/|https:\/\/app\.courtsidebase\.com)/.test(back) ? back : 'courtside://health';

async function tokensFor(uid: string): Promise<{ access: string } | null> {
  const { data: row } = await admin.from('whoop_tokens').select('*').eq('user_id', uid).maybeSingle();
  if (!row) return null;
  if (Date.parse(row.expires_at) - Date.now() > 60_000) return { access: row.access_token };
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: clientId, client_secret: clientSecret, scope: 'offline' }) });
  if (!res.ok) return null;
  const t = await res.json();
  await admin.from('whoop_tokens').upsert({ user_id: uid, access_token: t.access_token, refresh_token: t.refresh_token ?? row.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() });
  return { access: t.access_token };
}

async function page(path: string, access: string, start: string, end: string) {
  const out: any[] = [];
  let next: string | undefined;
  for (let i = 0; i < 5; i += 1) {
    const q = new URLSearchParams({ start, end, limit: '25', ...(next ? { nextToken: next } : {}) });
    const res = await fetch(`${API}${path}?${q}`, { headers: { authorization: `Bearer ${access}` } });
    if (!res.ok) break;
    const body = await res.json();
    out.push(...(body.records ?? []));
    next = body.next_token;
    if (!next) break;
  }
  return out;
}

/** The last week from WHOOP, folded into a row per day. */
async function sync(uid: string): Promise<number> {
  const t = await tokensFor(uid);
  if (!t) throw new Error('not connected');
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 86_400_000);
  const [recovery, sleep, cycles] = await Promise.all([page('/recovery', t.access, start.toISOString(), end.toISOString()), page('/activity/sleep', t.access, start.toISOString(), end.toISOString()), page('/cycle', t.access, start.toISOString(), end.toISOString())]);
  const days = new Map<string, Record<string, unknown>>();
  const at = (date: string) => { const d = days.get(date) ?? { user_id: uid, date, sources: {} as Record<string, string> }; days.set(date, d); return d; };
  const src = (d: Record<string, unknown>, k: string) => { (d.sources as Record<string, string>)[k] = 'whoop'; };
  const sleepDay = new Map<string, string>();
  for (const s of sleep) {
    if (s.nap) continue;
    const date = String(s.end).slice(0, 10);
    sleepDay.set(String(s.id), date);
    const st = s.score?.stage_summary;
    if (st) { const d = at(date); d.sleep_hours = Math.round(((st.total_in_bed_time_milli - st.total_awake_time_milli) / 3_600_000) * 100) / 100; src(d, 'sleep_hours'); }
  }
  for (const r of recovery) {
    const date = sleepDay.get(String(r.sleep_id)) ?? String(r.created_at).slice(0, 10);
    const d = at(date);
    if (r.score?.recovery_score != null) { d.recovery = Math.round(r.score.recovery_score); src(d, 'recovery'); }
    if (r.score?.resting_heart_rate != null) { d.resting_hr = Math.round(r.score.resting_heart_rate); src(d, 'resting_hr'); }
    if (r.score?.hrv_rmssd_milli != null) { d.hrv_ms = Math.round(r.score.hrv_rmssd_milli); src(d, 'hrv_ms'); }
  }
  for (const c of cycles) {
    if (!c.end) continue;
    const d = at(String(c.end).slice(0, 10));
    if (c.score?.kilojoule != null) { d.calories = Math.round(c.score.kilojoule / 4.184); src(d, 'calories'); }
  }
  const rows = [...days.values()];
  if (rows.length) {
    // Other sources' numbers on the same day are kept: only WHOOP's columns are written.
    for (const row of rows) {
      const { data: have } = await admin.from('health_days').select('sources').eq('user_id', uid).eq('date', row.date).maybeSingle();
      const sources = { ...(have?.sources ?? {}), ...(row.sources as object) };
      await admin.from('health_days').upsert({ ...row, sources, updated_at: new Date().toISOString() });
    }
  }
  await admin.from('health_connections').upsert({ user_id: uid, provider: 'whoop', last_synced_at: new Date().toISOString() });
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/whoop/, '');
  if (!clientId || !clientSecret) return json({ error: 'WHOOP is not set up on the server yet.' }, 503);

  if (path === '/start') {
    const uid = await whoIs(req);
    if (!uid) return json({ error: 'Sign in first.' }, 401);
    const posted = await req.json().catch(() => ({})) as { back?: string };
    const back = safeBack(posted.back ?? new URL(req.url).searchParams.get('back') ?? 'courtside://health');
    const state = await sign({ uid, back, n: crypto.randomUUID() });
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: SCOPES, state });
    return json({ url: `${AUTH}?${q}` });
  }

  if (path === '/callback') {
    const p = new URL(req.url).searchParams;
    const opened = p.get('state') ? await open(p.get('state')!) : null;
    const back = safeBack(opened?.back ?? 'courtside://health');
    const go = (result: string) => Response.redirect(`${back}${back.includes('?') ? '&' : '?'}whoop=${result}`, 302);
    if (!opened || !p.get('code')) return go('refused');
    const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code')!, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }) });
    if (!res.ok) return go('failed');
    const t = await res.json();
    await admin.from('whoop_tokens').upsert({ user_id: opened.uid, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() });
    await admin.from('health_connections').upsert({ user_id: opened.uid, provider: 'whoop', connected_at: new Date().toISOString() });
    try { await sync(opened.uid); } catch { /* the app can ask again */ }
    return go('connected');
  }

  const uid = await whoIs(req);
  if (!uid) return json({ error: 'Sign in first.' }, 401);
  if (path === '/sync') {
    try { return json({ days: await sync(uid) }); } catch (e) { return json({ error: e instanceof Error ? e.message : 'sync failed' }, 400); }
  }
  if (path === '/disconnect') {
    await admin.from('whoop_tokens').delete().eq('user_id', uid);
    await admin.from('health_connections').delete().eq('user_id', uid).eq('provider', 'whoop');
    return json({ ok: true });
  }
  return json({ error: 'unknown path' }, 404);
});
