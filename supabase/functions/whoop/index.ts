// CourtSide ↔ WHOOP — a Supabase Edge Function.
//
// The app never holds WHOOP's client secret. Six jobs, by path:
//   /start      — (signed-in) sends the browser to WHOOP to say yes, within
//                 ten minutes. With {tennis: true} it also asks to read
//                 workouts, and that yes turns tennis sessions on (migration 58);
//                 {workouts: true} as well turns every workout on (a run, the
//                 gym: migration 135), when the app's screen said so
//   /callback   — WHOOP sends the browser back here; the code becomes tokens,
//                 which are parked (?whoop=pending&n=…) for /finish. Every
//                 sign-in, tennis or not, since the security review (Oct 5):
//                 before, a plain sign-in went straight onto the account that
//                 started it, so a WHOOP link someone sent you put YOUR
//                 WHOOP health data on THEIR account
//   /finish     — (signed-in) the phone that started a sign-in collects it, as
//                 the same player: only then is it put on the account, and the
//                 last week is pulled (and the last week of workouts, quietly,
//                 each with its row in Notifications). Answers {ok, fresh}
//   /sync       — (signed-in) pulls the last week again. {only: 'workouts'}
//                 just looks for workouts in the last 36 hours (or {days: 1–7}
//                 back: the app asks for the past week once): the app's check
//                 when it opens, at most hourly. Answers {days, fresh,
//                 workoutDays, allWorkouts}, fresh being the sessions it just
//                 filed, workoutDays how far back it looked, and allWorkouts
//                 whether it looked for every workout or tennis only
//   /disconnect — (signed-in) revokes CourtSide's access at WHOOP (which also
//                 stops its webhooks), removes what WHOOP sent, forgets the tokens
//   /webhook    — (POST, signed by WHOOP, no app token) WHOOP saying a
//                 workout was saved, changed or deleted
//
// Deploy:   supabase functions deploy whoop --no-verify-jwt
//           (WHOOP's redirect and webhook carry no app token; /start, /finish,
//            /sync and /disconnect check the person's token themselves).
//           Run migration 58 first (/finish needs its whoop_pending table).
//           Tennis sessions carry WHOOP's heart-rate zone times (workout.ts);
//           migration 65 stores them. Either can go first: before 65 the
//           database ignores them. Migration 155 (Oct 8) before this
//           version's heart-rate refill can run: until then it is skipped.
// Secrets:  supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=...
//           optional ALLOW_DEV_RETURN=1 while testing in Expo Go (remove before going live):
//           without it, a sign-in only ever returns to the app or app.courtsidebase.com.
// WHOOP app: redirect URL = https://<project>.supabase.co/functions/v1/whoop/callback
//            scopes = read:recovery read:sleep read:cycles read:profile read:workout offline
//            webhook URL = https://<project>.supabase.co/functions/v1/whoop/webhook, model version v2
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWhoop } from './verify.ts';
import { isTennis, sportOf, toPayload, type WhoopWorkout } from './workout.ts';

/** Supabase's runtime: keeps the function alive for work that finishes after the answer. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer/v2';
// Workouts are asked for only by someone turning tennis sessions on, so
// WHOOP's consent screen never lists something CourtSide will not use.
const BASE_SCOPES = 'read:recovery read:sleep read:cycles read:profile offline';
const SCOPES = 'read:recovery read:sleep read:cycles read:profile read:workout offline';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const clientId = Deno.env.get('WHOOP_CLIENT_ID') ?? '';
const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET') ?? '';
const redirectUri = `${url}/functions/v1/whoop/callback`;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits before trying a webhook again once WHOOP already has its answer. */
const RETRY_MS = [2_000, 10_000];
/** PostgREST's "no such function": a database before migration 58. */
const NO_FUNCTION = 'PGRST202';

/** Who is asking, from the app's own token. */
async function whoIs(req: Request): Promise<string | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return null;
  const { data } = await admin.auth.getUser(bearer);
  return data.user?.id ?? null;
}

/** The state that travels through WHOOP and back: who, where to return, and whether tennis was asked for, signed so nobody can forge it. */
const key = crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function sign(payload: object) { const body = b64(new TextEncoder().encode(JSON.stringify(payload))); const mac = b64(await crypto.subtle.sign('HMAC', await key, new TextEncoder().encode(body))); return `${body}.${mac}`; }
async function open(state: string): Promise<{ uid: string; back: string; tennis?: boolean; workouts?: boolean; exp?: number } | null> {
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;
  const ok = await crypto.subtle.verify('HMAC', await key, unb64(mac), new TextEncoder().encode(body));
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(unb64(body))); } catch { return null; }
}
/** How long a sign-in link works: an old one, found or sent later, is useless. */
const SIGN_IN_MS = 10 * 60_000;
/**
 * Only the app's own addresses may be returned to. Expo Go's addresses only
 * while ALLOW_DEV_RETURN is set: anyone can open one of those, so in
 * production a sign-in's pick-up code could otherwise be sent to a stranger.
 */
const DEV_RETURN = Deno.env.get('ALLOW_DEV_RETURN') === '1';
const safeBack = (back: string) =>
  /^(courtside:\/\/|https:\/\/app\.courtsidebase\.com\/)/.test(back)
  || (DEV_RETURN && /^(exps?:\/\/[a-z0-9-]+\.exp\.direct\/|exps?:\/\/(localhost|\d{1,3}(\.\d{1,3}){3}):\d+\/)/.test(back))
    ? back : 'courtside://health';

/** Tennis sessions on or off for this person's WHOOP (the app shows 'Turn on tennis sessions' again when off). */
async function setReadsWorkouts(uid: string, on: boolean) {
  await admin.from('health_connections').update({ reads_workouts: on }).match({ user_id: uid, provider: 'whoop' });
}

/**
 * Saves WHOOP's keys. Migration 58's columns (scope, the refresh lock, the
 * WHOOP member id) go in `extra`; a database without them still keeps the
 * keys, so WHOOP works as before whichever is deployed first.
 */
async function writeTokens(uid: string, how: 'upsert' | 'update', base: Record<string, unknown>, extra: Record<string, unknown>) {
  const write = (fields: Record<string, unknown>) =>
    how === 'upsert' ? admin.from('whoop_tokens').upsert({ user_id: uid, ...fields }) : admin.from('whoop_tokens').update(fields).eq('user_id', uid);
  const { error } = await write({ ...base, ...extra });
  // Only a missing column (no migration 58) means "save the keys alone"; any other error is real.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) return write(base).then((r) => r.error);
  return error;
}
const unlock = (uid: string) => admin.from('whoop_tokens').update({ refresh_lock_until: null }).eq('user_id', uid).then(() => undefined);

/** WHOOP's sample refresh answer lists every granted scope. One that names no data scope at all tells nothing new, so the stored list stands. */
const keptScope = (fresh: unknown, stored: string | null): string | null =>
  typeof fresh === 'string' && fresh.includes('read:') ? fresh : stored ?? (typeof fresh === 'string' ? fresh : null);
/** A full scope list without workouts: this key cannot read tennis sessions. */
const lacksWorkouts = (scope: string | null) => { const s = (scope ?? '').split(' '); return s.some((x) => x.startsWith('read:')) && !s.includes('read:workout'); };

/** A key, what it may read, and the WHOOP member it belongs to (only for a sign-in this player's own phone collected). */
type Tokens = { access: string; scope: string | null; member: number | null };
/**
 * A working WHOOP key for this person. It is refreshed when it is about to
 * run out, or when `stale` (a key WHOOP just refused) is still the stored one.
 * WHOOP invalidates the old refresh token on every refresh, so only the
 * request holding claim_whoop_refresh refreshes; the others wait and use its
 * key. Tennis is turned off only when WHOOP says the stored refresh token is
 * dead (invalid_grant), never on a network error or a lost race.
 */
async function tokensFor(uid: string, stale?: string): Promise<Tokens | null> {
  for (let i = 0; i < 6; i += 1) {
    const { data: row } = await admin.from('whoop_tokens').select('*').eq('user_id', uid).maybeSingle();
    if (!row) return null;
    if (row.access_token !== stale && Date.parse(row.expires_at) - Date.now() > 60_000) return { access: row.access_token, scope: row.scope ?? null, member: row.whoop_user_id ?? null };
    const { data: mine, error: noLock } = await admin.rpc('claim_whoop_refresh', { u: uid });
    // Someone else is refreshing: wait for their key. (No lock at all before migration 58: refresh as before.)
    if (mine !== true && noLock?.code !== NO_FUNCTION) { await wait(1000); continue; }
    // Read again now the lock is ours: a refresh that finished between the
    // read above and the claim left a new refresh token, the only one that still works.
    const { data: cur } = await admin.from('whoop_tokens').select('*').eq('user_id', uid).maybeSingle();
    if (!cur) return null;
    if (cur.refresh_token !== row.refresh_token) { await unlock(uid); continue; }
    let res: Response;
    try {
      // Well inside the 20-second lock, so no second refresh can start while this one is out.
      res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cur.refresh_token, client_id: clientId, client_secret: clientSecret, scope: 'offline' }), signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      console.error('[whoop] refresh', e);
      await unlock(uid);
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      await unlock(uid);
      if (err.error === 'invalid_grant') {
        // Still the token WHOOP just refused? Then the connection is gone; otherwise someone else refreshed: use theirs.
        const { data: now } = await admin.from('whoop_tokens').select('refresh_token').eq('user_id', uid).maybeSingle();
        if (now && now.refresh_token !== cur.refresh_token) continue;
        await setReadsWorkouts(uid, false);
      }
      return null;
    }
    const t = await res.json();
    const scope = keptScope(t.scope, cur.scope ?? null);
    await writeTokens(uid, 'update', { access_token: t.access_token, refresh_token: t.refresh_token ?? cur.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }, { scope, refresh_lock_until: null });
    return { access: t.access_token, scope, member: cur.whoop_user_id ?? null };
  }
  return null;
}

/** One GET from WHOOP's API as this person. A refused key is swapped (another request's, or one refresh) and the call tried once more. Null when there is no key. */
async function whoopGet(uid: string, pathAndQuery: string): Promise<Response | null> {
  const t = await tokensFor(uid);
  if (!t) return null;
  const res = await fetch(API + pathAndQuery, { headers: { authorization: `Bearer ${t.access}` } });
  if (res.status !== 401) return res;
  await res.body?.cancel();
  const again = await tokensFor(uid, t.access);
  if (!again) return null;
  return fetch(API + pathAndQuery, { headers: { authorization: `Bearer ${again.access}` } });
}

/** Up to `maxPages` pages of one WHOOP collection, the last answer's status (0 when there was no key), and whether that was all of it. */
// deno-lint-ignore no-explicit-any
async function page(uid: string, path: string, start: string, end: string, maxPages = 5): Promise<{ records: any[]; status: number; complete: boolean }> {
  // deno-lint-ignore no-explicit-any
  const records: any[] = [];
  let next: string | undefined;
  let status = 0;
  for (let i = 0; i < maxPages; i += 1) {
    const q = new URLSearchParams({ start, end, limit: '25', ...(next ? { nextToken: next } : {}) });
    const res = await whoopGet(uid, `${path}?${q}`);
    if (!res) return { records, status: 0, complete: false };
    status = res.status;
    if (!res.ok) { await res.body?.cancel(); return { records, status, complete: false }; }
    const body = await res.json();
    records.push(...(body.records ?? []));
    next = body.next_token;
    if (!next) return { records, status, complete: true };
  }
  return { records, status, complete: false };
}

/** The 15-minute sweep (migration 58), run here too in case pg_cron is not set up. */
async function sweep() {
  const { error } = await admin.rpc('sweep_activities');
  if (error && error.code !== NO_FUNCTION) console.error('[whoop] sweep', error.message);
}

/**
 * What this person has switched on from WHOOP: tennis (migration 58), and
 * every other workout (activity_allowed: the 'workouts-whoop' switch and
 * their own yes to every workout, migrations 107 and 135). A database
 * without activity_allowed answers tennis only, as before.
 */
type Wants = { tennis: boolean; all: boolean };
async function wants(uid: string): Promise<Wants> {
  const [t, a] = await Promise.all([
    admin.rpc('tennis_allowed', { u: uid, src: 'whoop' }),
    admin.rpc('activity_allowed', { u: uid, src: 'whoop', a_sport: 'workout' }),
  ]);
  return { tennis: t.data === true, all: a.data === true };
}
/** A workout to keep: tennis with tennis on; anything else that is a workout (never a sauna or meditation) with every workout on. */
const keeps = (w: WhoopWorkout, on: Wants) => (isTennis(w) ? on.tennis : on.all && sportOf(w) !== null);

/** Files each workout this person keeps. Returns the ids of those that just got their alert. */
async function recordWorkouts(uid: string, list: WhoopWorkout[], quiet: boolean, on: Wants): Promise<string[]> {
  const fresh: string[] = [];
  for (const w of list) {
    if (!keeps(w, on)) { if (w.sport_name && !isTennis(w)) console.log('[whoop] not kept:', w.sport_name); continue; }
    const { data, error } = await admin.rpc('record_activity', { u: uid, src: 'whoop', ext: w.id, p: toPayload(w), quiet });
    if (error) { console.error('[whoop] record', error.message); continue; }
    if (data?.note === 'filed' || data?.note === 'pushed') fresh.push(data.id);
  }
  return fresh;
}

/**
 * Tennis (and, once switched on, every other workout) in the last `hours`
 * (36 unless asked for more: the past week when WHOOP is connected, once
 * after the Oct 5 update, the first time after every workout is turned on,
 * and whenever the app holds none of WHOOP's), filed quietly (the app shows
 * its own banner), each with its row in Notifications. Also the safety net
 * for a webhook that never came or failed after its answer: a workout WHOOP
 * deleted, or that is no longer one this person keeps, is taken back.
 * `all`: every workout was looked for, not only tennis.
 */
async function workoutsFor(uid: string, hours = 36): Promise<{ fresh: string[]; all: boolean }> {
  const none = { fresh: [], all: false };
  const on = await wants(uid);
  if (!on.tennis && !on.all) return none;
  const t = await tokensFor(uid);
  // No member: this WHOOP came from a plain sign-in, which no phone collected, or a newer link took
  // the member. Such a key may belong to someone else's WHOOP, so it never brings in workouts.
  if (!t || t.member == null) return none;
  if (lacksWorkouts(t.scope)) { await setReadsWorkouts(uid, false); return none; }
  const end = new Date();
  const since = new Date(end.getTime() - hours * 3_600_000).toISOString();
  // 25 to a page: two pages for a day and a half, more for a week.
  const r = await page(uid, '/activity/workout', since, end.toISOString(), hours > 36 ? 6 : 2);
  // WHOOP says this key may not read workouts.
  if (r.status === 403) { await setReadsWorkouts(uid, false); return none; }
  const fresh = await recordWorkouts(uid, r.records, true, on);
  // Only from WHOOP's whole list, and never a session filed in the last 10 minutes (the list can lag the webhook).
  if (r.complete) {
    const kept = new Set((r.records as WhoopWorkout[]).filter((w) => keeps(w, on)).map((w) => String(w.id)));
    const { data: mine, error } = await admin.from('detected_activities').select('external_id').eq('user_id', uid).eq('source', 'whoop')
      .in('status', ['new', 'duplicate']).gte('started_at', since).lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    if (error) console.error('[whoop] reconcile', error.message);
    for (const m of (mine ?? []) as { external_id: string }[]) if (!kept.has(m.external_id)) await withdraw(uid, m.external_id);
  }
  return { fresh, all: on.all };
}

/**
 * Oct 8: until migration 155 and this version, every WHOOP workout came in
 * without its heart rate and zones (WHOOP sends percent_recorded as 0–1,
 * which read as under 1%: see percentRecorded). Once per connection, the
 * workouts already here that have no heart rate are read from WHOOP again
 * (back to the oldest, 30 days at most, as far as record_activity takes) and
 * record_activity fills them in. Only those: nothing new is filed and nothing
 * is taken back here. whoop_tokens.hr_refilled_at (migration 155) says it is
 * done: empty for connections made before it, set for any made since. A
 * database without it, a WHOOP that did not answer, nothing switched on, or
 * a workout that did not go through leaves it for the next look.
 */
async function refillHeartRate(uid: string): Promise<void> {
  const { data: t, error } = await admin.from('whoop_tokens').select('hr_refilled_at, whoop_user_id').eq('user_id', uid).maybeSingle();
  // No migration 155 yet (no such column), no WHOOP, or already done.
  if (error || !t || t.hr_refilled_at) return;
  const done = async () => { await admin.from('whoop_tokens').update({ hr_refilled_at: new Date().toISOString() }).eq('user_id', uid); };
  // As workoutsFor: a key no phone of this player's collected never reads workouts.
  if (t.whoop_user_id == null) return done();
  const { data: rows, error: bad } = await admin.from('detected_activities').select('external_id, started_at').eq('user_id', uid).eq('source', 'whoop')
    .is('avg_hr', null).neq('status', 'withdrawn').gte('started_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (bad) { console.error('[whoop] refill', bad.message); return; }
  const want = new Set(((rows ?? []) as { external_id: string }[]).map((r) => r.external_id));
  if (!want.size) return done();
  // As workoutsFor: only what this person still brings in from WHOOP. With
  // nothing switched on, no WHOOP call, and it waits for the switch.
  const on = await wants(uid);
  if (!on.tennis && !on.all) return;
  const oldest = Math.min(...((rows ?? []) as { started_at: string }[]).map((r) => Date.parse(r.started_at)));
  const r = await page(uid, '/activity/workout', new Date(oldest - 3_600_000).toISOString(), new Date().toISOString(), 12);
  // WHOOP answered, but this key may not read workouts: nothing to fill in, ever.
  if (r.status === 403) return done();
  // No key, or WHOOP did not answer: the next look tries again.
  if (r.status !== 200) return;
  let filled = 0;
  let failed = 0;
  for (const w of r.records as WhoopWorkout[]) {
    // One already here, filed as the usual look files it: never one WHOOP now
    // calls something not kept (a session renamed a sauna does not come back
    // as a 'workout'); the usual look takes those back itself.
    if (!want.has(String(w.id)) || !keeps(w, on)) continue;
    const { error: no } = await admin.rpc('record_activity', { u: uid, src: 'whoop', ext: w.id, p: toPayload(w), quiet: true });
    // One that did not go through never holds up the rest; the next look tries again.
    if (no) { console.error('[whoop] refill record', no.message); failed += 1; continue; }
    filled += 1;
  }
  console.log('[whoop] refilled', filled, 'of', want.size, ...(failed ? [`(${failed} failed: the next look tries again)`] : []));
  if (!failed) await done();
}

/**
 * The last week from WHOOP, folded into a row per day, plus any new
 * workouts. With only = 'workouts', just the workouts. `workoutDays` (1 to 7)
 * looks that far back for them instead of the last 36 hours; the answer's
 * `workoutDays` says how far it looked, so the app knows this version did,
 * and `allWorkouts` whether that was every workout or tennis only.
 */
type Synced = { days: number; fresh: string[]; workoutDays: number; allWorkouts: boolean };
async function sync(uid: string, only?: 'workouts', workoutDays?: number): Promise<Synced> {
  const { data: have } = await admin.from('whoop_tokens').select('user_id').eq('user_id', uid).maybeSingle();
  if (!have) throw new Error('not connected');
  const looked = workoutDays && workoutDays > 0 ? Math.min(7, workoutDays) : 1.5;
  let fresh: string[] = [];
  let allWorkouts = false;
  try { ({ fresh, all: allWorkouts } = await workoutsFor(uid, Math.round(looked * 24))); } catch (e) { console.error('[whoop] workouts', e); }
  // Once per connection: heart rate and zones back on the workouts already here (Oct 8, migration 155).
  try { await refillHeartRate(uid); } catch (e) { console.error('[whoop] refill', e); }
  await sweep();
  if (only === 'workouts') return { days: 0, fresh, workoutDays: looked, allWorkouts };
  // As before: a key WHOOP will no longer refresh means connecting again.
  if (!(await tokensFor(uid))) throw new Error('not connected');
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 86_400_000);
  const [recovery, sleep, cycles] = await Promise.all([
    page(uid, '/recovery', start.toISOString(), end.toISOString()).then((r) => r.records),
    page(uid, '/activity/sleep', start.toISOString(), end.toISOString()).then((r) => r.records),
    page(uid, '/cycle', start.toISOString(), end.toISOString()).then((r) => r.records),
  ]);
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
  // Disconnected while this ran: write nothing back (no WHOOP numbers, no 'connected' row).
  if (!(await stillConnected(uid))) return { days: 0, fresh, workoutDays: looked, allWorkouts };
  if (rows.length) {
    // Other sources' numbers on the same day are kept: only WHOOP's columns are written.
    for (const row of rows) {
      const { data: have } = await admin.from('health_days').select('sources').eq('user_id', uid).eq('date', row.date).maybeSingle();
      const sources = { ...(have?.sources ?? {}), ...(row.sources as object) };
      await admin.from('health_days').upsert({ ...row, sources, updated_at: new Date().toISOString() });
    }
  }
  if (!(await stillConnected(uid))) return { days: 0, fresh, workoutDays: looked, allWorkouts };
  await admin.from('health_connections').upsert({ user_id: uid, provider: 'whoop', last_synced_at: new Date().toISOString() });
  return { days: rows.length, fresh, workoutDays: looked, allWorkouts };
}
const stillConnected = async (uid: string) => !!(await admin.from('whoop_tokens').select('user_id').eq('user_id', uid).maybeSingle()).data;

/** WHOOP's answer to a sign-in, as kept until it is put on an account. `workouts`: every workout was asked for too, not only tennis. */
type Answer = { access_token: string; refresh_token: string; expires_at: string; scope: string; member: number | null; workouts?: boolean };

/**
 * Puts a WHOOP sign-in on this account. `bound`: the phone that started it,
 * signed in as this player, collected it (/finish). Only then is the WHOOP
 * member remembered (so its webhooks reach this account) and tennis turned
 * on, and every workout too when the app asked for that. Answers an error,
 * or the ids of the past week's sessions it just filed.
 */
async function link(uid: string, a: Answer, bound: boolean): Promise<{ error: string } | { fresh: string[] }> {
  const member = bound ? a.member : null;
  if (member != null) {
    // One CourtSide account per WHOOP member: an older link elsewhere stops hearing about its workouts.
    const { data: others } = await admin.from('whoop_tokens').select('user_id').eq('whoop_user_id', member).neq('user_id', uid);
    for (const o of (others ?? []) as { user_id: string }[]) {
      await admin.from('whoop_tokens').update({ whoop_user_id: null }).eq('user_id', o.user_id);
      await setReadsWorkouts(o.user_id, false);
    }
  }
  const error = await writeTokens(uid, 'upsert', { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: a.expires_at, updated_at: new Date().toISOString() }, { scope: a.scope, refresh_lock_until: null, whoop_user_id: member });
  if (error) return { error: error.message };
  const tennis = member != null && a.scope.split(' ').includes('read:workout');
  await admin.from('health_connections').upsert({ user_id: uid, provider: 'whoop', connected_at: new Date().toISOString(), ...(tennis ? { reads_workouts: true } : {}) });
  // Every workout is its own yes (migration 107): on only when this sign-in asked for it, never carried over from
  // an older one. Apart from the row above, so a database without the column (before 107) still connects.
  if (tennis) await admin.from('health_connections').update({ reads_all_workouts: a.workouts === true }).match({ user_id: uid, provider: 'whoop' });
  // Any other sign-in leaves tennis off (the app offers 'Turn on tennis sessions' again).
  if (!tennis) await setReadsWorkouts(uid, false);
  // The past week of workouts too, each one in Notifications to log (Oct 5).
  try { return { fresh: (await sync(uid, undefined, 7)).fresh }; } catch { /* the app can ask again */ }
  return { fresh: [] };
}

/** WHOOP took a workout back (deleted, or no longer tennis): so does CourtSide, unless it was logged. */
async function withdraw(u: string, ext: string) {
  const { error } = await admin.rpc('withdraw_activity', { u, src: 'whoop', ext });
  if (error) throw new Error(error.message);
}

/** One webhook. Throws when WHOOP should send it again. */
async function onEvent(e: { user_id: number; id: string | number; type: string }) {
  // Sleep and recovery events are not used yet; they are a free moment to sweep.
  if (!e.type.startsWith('workout.')) { await sweep(); return; }
  const { data: rows, error } = await admin.rpc('whoop_tennis_users', { w: e.user_id });
  if (error) { if (error.code === NO_FUNCTION) return; throw new Error(error.message); }
  const uids = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!uids.length) return;
  const ext = String(e.id);
  if (e.type === 'workout.deleted') { for (const u of uids) await withdraw(u, ext); return; }
  for (const u of uids) {
    const res = await whoopGet(u, '/activity/workout/' + encodeURIComponent(ext));
    if (!res) throw new Error('no WHOOP key');
    if (res.status === 404) { await res.body?.cancel(); await withdraw(u, ext); continue; }
    if (res.status === 403) { await res.body?.cancel(); await setReadsWorkouts(u, false); continue; }
    if (!res.ok) { await res.body?.cancel(); throw new Error('WHOOP ' + res.status); }
    const w = await res.json() as WhoopWorkout;
    // Not one this person keeps (or no longer: renamed from tennis to a run with only tennis on): taken back.
    if (!keeps(w, await wants(u))) { console.log('[whoop] sport', w.sport_name); await withdraw(u, ext); continue; }
    const { error: bad } = await admin.rpc('record_activity', { u, src: 'whoop', ext: w.id, p: toPayload(w), quiet: false });
    if (bad) throw new Error(bad.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/whoop/, '');
  if (!clientId || !clientSecret) return json({ error: 'WHOOP is not set up on the server yet.' }, 503);

  if (path === '/webhook') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const raw = await req.text();
    if (!(await verifyWhoop(raw, req.headers.get('x-whoop-signature'), req.headers.get('x-whoop-signature-timestamp'), clientSecret))) return json({ error: 'bad signature' }, 401);
    let e: { user_id?: number; id?: string | number; type?: string };
    try { e = JSON.parse(raw); } catch { return json({ ok: true }); }
    if (!e?.user_id || e.id == null || !e.type) return json({ ok: true });
    // WHOOP wants a 2XX within a second. A quick failure answers 500 so WHOOP retries (five times over about an hour);
    // slow work carries on after the answer. Repeats are harmless: record_activity upserts and notifies once.
    const ev = e as { user_id: number; id: string | number; type: string };
    const attempt = () => onEvent(ev).then(() => 'done' as const, (err) => { console.error('[whoop webhook]', err); return 'failed' as const; });
    const settled = attempt();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([settled, new Promise<'slow'>((r) => { timer = setTimeout(() => r('slow'), 900); })]);
    clearTimeout(timer);
    if (outcome === 'failed') return json({ error: 'try again' }, 500);
    if (outcome === 'slow' && typeof EdgeRuntime !== 'undefined') {
      // WHOOP already has its 200 and will not send this again, so a failure from here is tried twice more here.
      EdgeRuntime.waitUntil(settled.then(async (o) => {
        for (const ms of RETRY_MS) { if (o !== 'failed') return; await wait(ms); o = await attempt(); }
      }));
    }
    return json({ ok: true });
  }

  if (path === '/start') {
    const uid = await whoIs(req);
    if (!uid) return json({ error: 'Sign in first.' }, 401);
    const posted = await req.json().catch(() => ({})) as { back?: string; tennis?: boolean; workouts?: boolean };
    const back = safeBack(posted.back ?? new URL(req.url).searchParams.get('back') ?? 'courtside://health');
    const tennis = posted.tennis === true;
    // Every workout, not only tennis: same WHOOP permission, the app's own yes (migration 135).
    const workouts = tennis && posted.workouts === true;
    const state = await sign({ uid, back, tennis, workouts, n: crypto.randomUUID(), exp: Date.now() + SIGN_IN_MS });
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: tennis ? SCOPES : BASE_SCOPES, state });
    return json({ url: `${AUTH}?${q}` });
  }

  if (path === '/callback') {
    const p = new URL(req.url).searchParams;
    const opened = p.get('state') ? await open(p.get('state')!) : null;
    const back = safeBack(opened?.back ?? 'courtside://health');
    const go = (result: string) => Response.redirect(`${back}${back.includes('?') ? '&' : '?'}whoop=${result}`, 302);
    if (!opened || !p.get('code')) return go('refused');
    if (!(typeof opened.exp === 'number' && opened.exp > Date.now())) return go('expired');
    const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code')!, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }) });
    if (!res.ok) return go('failed');
    const t = await res.json();
    const scope: string = typeof t.scope === 'string' ? t.scope : opened.tennis ? SCOPES : BASE_SCOPES;
    const answer: Answer = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), scope, member: null, workouts: opened.tennis === true && opened.workouts === true };
    if (opened.tennis) {
      // Tennis: webhooks name only the WHOOP member, so learn which one this is.
      const prof = await fetch(API + '/user/profile/basic', { headers: { authorization: 'Bearer ' + t.access_token } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      answer.member = typeof prof?.user_id === 'number' ? prof.user_id : null;
    }
    // Parked until the phone that started this collects it as the same player
    // (/finish), under a fresh code that only this browser sees: the state's
    // own code was in a link that anyone could have been sent.
    const n = crypto.randomUUID();
    await admin.from('whoop_pending').delete().lt('expires_at', new Date().toISOString());
    const { error } = await admin.from('whoop_pending').insert({ n, user_id: opened.uid, answer, expires_at: new Date(Date.now() + SIGN_IN_MS).toISOString() });
    if (error) { console.error('[whoop] pending', error.message); return go('failed'); }
    return go(`pending&n=${n}`);
  }

  const uid = await whoIs(req);
  if (!uid) return json({ error: 'Sign in first.' }, 401);
  if (path === '/sync') {
    const posted = await req.json().catch(() => ({})) as { only?: string; days?: unknown };
    // {days: 1–7}: how far back to look for workouts (the app asks for the past week once).
    const days = typeof posted.days === 'number' && Number.isFinite(posted.days) && posted.days > 0 ? Math.min(7, posted.days) : undefined;
    try { return json(await sync(uid, posted.only === 'workouts' ? 'workouts' : undefined, days)); } catch (e) { return json({ error: e instanceof Error ? e.message : 'sync failed' }, 400); }
  }
  if (path === '/finish') {
    const posted = await req.json().catch(() => ({})) as { n?: unknown };
    const n = typeof posted.n === 'string' && /^[0-9a-f-]{36}$/i.test(posted.n) ? posted.n : null;
    // Collected once, and only by the account that started it: a WHOOP
    // sign-in link someone else sent can never put your WHOOP on their
    // account, and someone else holding the code cannot use it up.
    // (Refusals answer 200 with the sentence the app shows.)
    const { data: taken } = n ? await admin.from('whoop_pending').delete().eq('n', n).eq('user_id', uid).select() : { data: null };
    const got = ((taken ?? []) as { user_id: string; answer: Answer; expires_at: string }[])[0];
    if (!got && n) {
      const { data: theirs } = await admin.from('whoop_pending').select('n').eq('n', n).gt('expires_at', new Date().toISOString()).limit(1);
      if ((theirs ?? []).length) return json({ error: 'That WHOOP sign-in was started on another account.' });
    }
    if (!got || Date.parse(got.expires_at) < Date.now()) return json({ error: 'That WHOOP sign-in has expired. Try again.' });
    const linked = await link(uid, got.answer, true);
    if ('error' in linked) { console.error('[whoop] link', linked.error); return json({ error: 'Could not connect WHOOP right now. Try again.' }); }
    // The past week's sessions it just filed, so the app can say they are in Notifications.
    return json({ ok: true, fresh: linked.fresh });
  }
  if (path === '/disconnect') {
    // Tennis off first, so no webhook or sync files a WHOOP session while the rest is removed.
    await setReadsWorkouts(uid, false);
    // Tell WHOOP: CourtSide's access is revoked and its webhooks stop. Best effort.
    try {
      const t = await tokensFor(uid);
      if (t) await fetch(API + '/user/access', { method: 'DELETE', headers: { authorization: `Bearer ${t.access}` } }).then((r) => r.body?.cancel());
    } catch { /* best effort */ }
    // Then remove what WHOOP sent. If that fails, keep the keys so trying again finishes the job.
    const { error } = await admin.rpc('forget_whoop_data', { u: uid });
    if (error && error.code !== NO_FUNCTION) {
      console.error('[whoop] forget', error.message);
      return json({ error: 'Could not disconnect WHOOP right now.' }, 500);
    }
    await admin.from('whoop_tokens').delete().eq('user_id', uid);
    await admin.from('health_connections').delete().eq('user_id', uid).eq('provider', 'whoop');
    return json({ ok: true });
  }
  return json({ error: 'unknown path' }, 404);
});
