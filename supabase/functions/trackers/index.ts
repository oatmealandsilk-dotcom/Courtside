// CourtSide ↔ Fitbit, Oura and Polar — one Supabase Edge Function for all three.
// Fitbit goes through Google's Health API since Oct 10, 2026 (owner, Oct 10:
// "Also can we make fibit work too"): Fitbit's own Web API shuts on Oct 30,
// 2026, and a Fitbit now signs in with the Google account it belongs to.
//
// Each tracker only brings in tennis sessions, the same way WHOOP's do
// (migration 58): its tennis workouts are read and filed with
// record_activity, so the same checks, the same duplicate rule (the same
// match from two trackers files one alert) and the same 30 days apply.
// A tracker whose keys are not in the server's secrets yet answers
// {on: false}, and the app shows it as "Coming soon".
//
// Paths:
//   /status             — which trackers are set up: {fitbit: {on}, oura: {on}, polar: {on}}
//   /start              — (signed-in) {provider, back}: the tracker's sign-in page,
//                         good for ten minutes. {on: false} when it is not set up
//                         or its switch is off for this person
//   /callback/<provider> — the tracker sends the browser back here; the code
//                         becomes keys, which wait (?tracker=pending&p=…&n=…)
//                         until the phone that started it collects them.
//                         Fitbit: ?tracker=notlinked when the Google account
//                         has no Google Health profile yet (or is an old
//                         Fitbit login), ?tracker=unavailable when Google has
//                         not let CourtSide's project in
//   /finish             — (signed-in) {n}: that phone collects the sign-in, as the
//                         same player. Only then is the tracker put on the account
//                         (so a sign-in link sent to someone else can never put
//                         their tracker on the sender's account), and the past
//                         week is looked through for tennis (Oct 5; was three days)
//   /sync               — (signed-in) {provider, days?}: tennis in the last 36
//                         hours (or `days`, at most 7). Answers {fresh, days}:
//                         the sessions it just filed and how many days it
//                         looked back. The app asks when it opens, at most
//                         hourly, and on "Sync now"
//   /disconnect         — (signed-in) {provider}: tells the tracker, removes what
//                         it sent (forget_tracker_data), forgets the keys
//
// Deploy:   supabase functions deploy trackers --no-verify-jwt
//           (the trackers' redirects carry no app token; /start, /finish,
//            /sync and /disconnect check the person's token themselves).
//           Run migration 69 first.
// Secrets:  FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET (a Google Cloud OAuth
//           client of type "Web application", with the Google Health API
//           switched on), OURA_CLIENT_ID / OURA_CLIENT_SECRET,
//           POLAR_CLIENT_ID / POLAR_CLIENT_SECRET.
//           Any pair left out keeps that tracker "Coming soon".
// Redirect URL to give each tracker:
//           https://auth.courtsidebase.com/functions/v1/trackers/callback/<provider>
//           (TRACKERS_CALLBACK_BASE overrides the part before /callback).
// Full steps for the owner: docs/trackers-setup.md.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isProvider, PROVIDERS, type ProviderId, type Session,
  fitbitFromOtherApp, fitbitIsTennis, fitbitSession, type FitbitExercise,
  ouraIsTennis, ouraSession, type OuraBeat, type OuraWorkout,
  polarIsTennis, polarSession, type PolarExercise,
} from './workouts.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const BASE = (Deno.env.get('TRACKERS_CALLBACK_BASE') ?? 'https://auth.courtsidebase.com/functions/v1/trackers').replace(/\/+$/, '');
const redirectFor = (p: ProviderId) => `${BASE}/callback/${p}`;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAME: Record<ProviderId, string> = { fitbit: 'Fitbit', oura: 'Oura', polar: 'Polar' };

/** Each tracker's addresses and how it signs in. */
type Config = {
  auth: string; token: string; scope: string;
  /** Fitbit's sign-in (Google's) takes PKCE as well as the secret. */
  pkce: boolean;
  /** The secret goes in a Basic header (Polar) rather than the form (Google for Fitbit, Oura). */
  basic: boolean;
  /** More for the sign-in page's address, when the tracker needs it. */
  extra?: Record<string, string>;
  id: string; secret: string;
};
const env = (k: string) => (Deno.env.get(k) ?? '').trim();
/**
 * What CourtSide asks Google for, both read-only: workouts (with their
 * average heart rate, zones and calories), and heart rate, for a session's
 * highest beat. The player may untick either on Google's page.
 */
const FITBIT_WORKOUTS = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
const FITBIT_HEART = 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly';
const GOOGLE_HEALTH = 'https://health.googleapis.com/v4/users/me';
const CONFIG: Record<ProviderId, Config> = {
  // FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET now hold a Google Cloud OAuth client's (docs/trackers-setup.md).
  // A refresh key comes only with access_type=offline, and on a second sign-in (after Disconnect) only when
  // Google asks again (consent); select_account lets someone with two Google accounts pick their Fitbit's.
  fitbit: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: `${FITBIT_WORKOUTS} ${FITBIT_HEART}`,
    pkce: true, basic: false, extra: { access_type: 'offline', prompt: 'consent select_account' },
    id: env('FITBIT_CLIENT_ID'), secret: env('FITBIT_CLIENT_SECRET'),
  },
  oura: { auth: 'https://cloud.ouraring.com/oauth/authorize', token: 'https://api.ouraring.com/oauth/token', scope: 'workout heartrate', pkce: false, basic: false, id: env('OURA_CLIENT_ID'), secret: env('OURA_CLIENT_SECRET') },
  polar: { auth: 'https://flow.polar.com/oauth2/authorization', token: 'https://polarremote.com/v2/oauth2/token', scope: 'accesslink.read_all', pkce: false, basic: true, id: env('POLAR_CLIENT_ID'), secret: env('POLAR_CLIENT_SECRET') },
};
const isSetUp = (p: ProviderId) => !!(CONFIG[p].id && CONFIG[p].secret);

/** Who is asking, from the app's own token. */
async function whoIs(req: Request): Promise<string | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return null;
  const { data } = await admin.auth.getUser(bearer);
  return data.user?.id ?? null;
}

// ------------------------------------------------- signed state, and PKCE
const key = crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const mac = async (text: string) => b64(await crypto.subtle.sign('HMAC', await key, new TextEncoder().encode(text)));
type State = { uid: string; back: string; p: ProviderId; n: string; exp: number };
async function sign(payload: State) { const body = b64(new TextEncoder().encode(JSON.stringify(payload))); return `${body}.${await mac(body)}`; }
async function open(state: string): Promise<State | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await key, unb64(sig), new TextEncoder().encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64(body)));
  } catch { return null; }
}
/** Fitbit's (Google's) PKCE secret for one sign-in, worked out again from its code rather than stored or sent anywhere. */
const verifierFor = (n: string) => mac('pkce:' + n);
const challengeOf = async (verifier: string) => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

const SIGN_IN_MS = 10 * 60_000;
/**
 * Only the app's own addresses may be returned to. Expo Go's addresses only
 * while ALLOW_DEV_RETURN=1 is set (testing): anyone can open one of those, so
 * in production a sign-in's pick-up code could otherwise be sent to a stranger.
 */
const DEV_RETURN = Deno.env.get('ALLOW_DEV_RETURN') === '1';
const safeBack = (back: string) =>
  /^(courtside:\/\/|https:\/\/app\.courtsidebase\.com\/)/.test(back)
  || (DEV_RETURN && /^(exps?:\/\/[a-z0-9-]+\.exp\.direct\/|exps?:\/\/(localhost|\d{1,3}(\.\d{1,3}){3}):\d+\/)/.test(back))
    ? back : 'courtside://health';

// --------------------------------------------------------------------- keys
/** What a sign-in gave: kept in tracker_pending until collected, then in tracker_tokens. */
type Answer = { access_token: string; refresh_token: string | null; expires_at: string | null; scope: string | null; member: string | null };

/** One call to a tracker's token address. The answer's body, or an error word. */
async function tokenCall(p: ProviderId, form: Record<string, string>): Promise<{ ok: true; t: Record<string, unknown> } | { ok: false; error: string }> {
  const c = CONFIG[p];
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (c.basic) headers.authorization = 'Basic ' + btoa(`${c.id}:${c.secret}`);
  const body = new URLSearchParams(c.basic ? form : { ...form, client_id: c.id, client_secret: c.secret });
  let res: Response;
  try { res = await fetch(c.token, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) }); } catch (e) { console.error(`[trackers] ${p} token`, e); return { ok: false, error: 'network' }; }
  const t = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.ok && typeof t.access_token === 'string') return { ok: true, t };
  // Google (for Fitbit), Oura and Polar say {error}; {errors: [{errorType}]} was Fitbit's own API.
  const errs = (t.errors as { errorType?: string }[] | undefined) ?? [];
  return { ok: false, error: String(t.error ?? errs[0]?.errorType ?? res.status) };
}
const expiry = (t: Record<string, unknown>) => (typeof t.expires_in === 'number' && t.expires_in > 0 ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null);

/** Tennis sessions on or off for this person's tracker (the app offers to turn them on again when off). */
const setReadsWorkouts = (uid: string, p: ProviderId, on: boolean) =>
  admin.from('health_connections').update({ reads_workouts: on }).match({ user_id: uid, provider: p }).then(() => undefined);
const unlock = (uid: string, p: ProviderId) => admin.from('tracker_tokens').update({ refresh_lock_until: null }).match({ user_id: uid, provider: p }).then(() => undefined);
const tokenRow = async (uid: string, p: ProviderId) => (await admin.from('tracker_tokens').select('*').match({ user_id: uid, provider: p }).maybeSingle()).data as
  { access_token: string; refresh_token: string | null; expires_at: string | null; member_id: string | null } | null;

/**
 * A working key for this person's tracker, refreshed when it is about to run
 * out or when `stale` (a key the tracker just refused) is still the stored
 * one. Oura invalidates the old refresh key on every refresh, so only the
 * request holding claim_tracker_refresh refreshes; others wait for its key.
 * Google (for Fitbit) keeps the same refresh key and usually sends none back:
 * then the stored one stays. Its sign-in keys last an hour (Fitbit's own
 * lasted eight). Tennis is turned off only when the tracker says the refresh
 * key is dead (Google: "invalid_grant", which is also what a Google project
 * still in Testing says after 7 days), never on a network error. Polar's keys
 * do not run out.
 */
async function tokensFor(uid: string, p: ProviderId, stale?: string): Promise<{ access: string; member: string | null } | null> {
  for (let i = 0; i < 6; i += 1) {
    const row = await tokenRow(uid, p);
    if (!row) return null;
    const fresh = !row.expires_at || Date.parse(row.expires_at) - Date.now() > 60_000;
    if (row.access_token !== stale && fresh) return { access: row.access_token, member: row.member_id };
    if (!row.refresh_token) {
      // Nothing to refresh with (Polar): a refused key means signing in again.
      if (row.access_token === stale) await setReadsWorkouts(uid, p, false);
      return null;
    }
    const { data: mine } = await admin.rpc('claim_tracker_refresh', { u: uid, prov: p });
    if (mine !== true) { await wait(1000); continue; }
    const cur = await tokenRow(uid, p);
    if (!cur) return null;
    if (cur.refresh_token !== row.refresh_token) { await unlock(uid, p); continue; }
    const r = await tokenCall(p, { grant_type: 'refresh_token', refresh_token: cur.refresh_token! });
    if (!r.ok) {
      await unlock(uid, p);
      if (r.error === 'invalid_grant' || r.error === 'invalid_token') {
        const now = await tokenRow(uid, p);
        if (now && now.refresh_token !== cur.refresh_token) continue;
        await setReadsWorkouts(uid, p, false);
      }
      return null;
    }
    const t = r.t;
    await admin.from('tracker_tokens').update({
      access_token: t.access_token, refresh_token: typeof t.refresh_token === 'string' ? t.refresh_token : cur.refresh_token,
      expires_at: expiry(t), refresh_lock_until: null, updated_at: new Date().toISOString(),
    }).match({ user_id: uid, provider: p });
    return { access: String(t.access_token), member: cur.member_id };
  }
  return null;
}

/**
 * One GET from a tracker's API as this person (or, with `post`, one POST of it
 * as JSON: Google's heart-rate roll-up). A refused key is swapped once and the
 * call tried again. Null when there is no key.
 */
async function apiGet(uid: string, p: ProviderId, address: string, post?: unknown): Promise<Response | null> {
  const t = await tokensFor(uid, p);
  if (!t) return null;
  const go = (access: string) => fetch(address, post === undefined
    ? { headers: { authorization: `Bearer ${access}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
    : { method: 'POST', headers: { authorization: `Bearer ${access}`, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(post), signal: AbortSignal.timeout(15_000) });
  const res = await go(t.access);
  if (res.status !== 401) return res;
  await res.body?.cancel();
  const again = await tokensFor(uid, p, t.access);
  return again ? go(again.access) : null;
}

// ----------------------------------------------------------- the workouts
/** Tennis sessions since `since`, the ids of every tennis session the tracker listed, and whether that list was the whole window. */
type Found = { sessions: Session[]; tennisIds: Set<string>; complete: boolean; refused: boolean };
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Google's words for why it said no: every reason code in its answer, both
 * ErrorInfo's reason ('ACCOUNT_NOT_LINKED', 'MISSING_OAUTH_SCOPE', …) and the
 * codes in its metadata.detailedReasons, where Google puts a refused filter's
 * exact code (developers.google.com/health/filters); else its status
 * ('PERMISSION_DENIED'). Plus its message, for the log. Reads the answer's body.
 */
type GoogleNo = { reasons: string[]; message: string };
async function googleError(res: Response): Promise<GoogleNo> {
  const b = await res.json().catch(() => ({})) as { error?: { status?: unknown; message?: unknown; details?: unknown } };
  const codes = (v: unknown): string[] => Array.isArray(v) ? v.flatMap(codes) : typeof v === 'string' ? v.match(/[A-Z][A-Z0-9_]{2,}/g) ?? [] : [];
  const details = (Array.isArray(b.error?.details) ? b.error.details : []) as { reason?: unknown; metadata?: { detailedReasons?: unknown } }[];
  const reasons = [...new Set(details.flatMap((d) => [...codes(d?.reason), ...codes(d?.metadata?.detailedReasons)]))];
  if (!reasons.length) reasons.push(...codes(b.error?.status));
  return { reasons, message: typeof b.error?.message === 'string' ? b.error.message.slice(0, 200) : '' };
}
/** Google's codes for a key without the yes CourtSide needs (its error catalog; the second is Google's general one). */
const SCOPE_GONE = new Set(['MISSING_OAUTH_SCOPE', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);
/** Google's codes for CourtSide's project not being let in (private preview) or the API not switched on in it. */
const NOT_OPEN = new Set(['API_PRIVATE_PREVIEW_ACCESS_DENIED', 'SERVICE_DISABLED']);
/** A Google refusal as one log line: "403 API_PRIVATE_PREVIEW_ACCESS_DENIED User is not eligible …". */
const said = (status: number | undefined, no: GoogleNo) => [status ?? 'network', no.reasons.join(',') || '-', no.message].join(' ').trim();

/**
 * Hands a Google sign-in back: one POST of either key withdraws CourtSide's
 * whole yes (developers.google.com/identity/protocols/oauth2/web-server).
 * Best effort.
 */
const googleRevoke = (token: string) =>
  fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(8_000) })
    .then((r) => r.body?.cancel()).catch(() => undefined);

/**
 * Google's heart rate over exactly one Fitbit workout: its highest beat (the
 * workout itself has only the average) and its average, in one window as long
 * as the workout. Best effort, as Oura's: with no heart rate, or a player who
 * unticked heart rate on Google's page, the session still comes in.
 */
async function fitbitHeart(uid: string, e: FitbitExercise): Promise<{ avg: number | null; max: number | null } | null> {
  const t0 = Date.parse(e.exercise?.interval?.startTime ?? '');
  const t1 = Date.parse(e.exercise?.interval?.endTime ?? '');
  if (!Number.isFinite(t0) || !(t1 > t0)) return null;
  try {
    const res = await apiGet(uid, 'fitbit', `${GOOGLE_HEALTH}/dataTypes/heart-rate/dataPoints:rollUp`, {
      range: { startTime: new Date(t0).toISOString(), endTime: new Date(t1).toISOString() },
      windowSize: `${Math.ceil((t1 - t0) / 1000)}s`,
    });
    if (!res?.ok) { await res?.body?.cancel(); return null; }
    const body = await res.json() as { rollupDataPoints?: { heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMax?: number } }[] };
    const hr = (body.rollupDataPoints ?? []).map((r) => r.heartRate)
      .filter((h): h is { beatsPerMinuteAvg?: number; beatsPerMinuteMax: number } => !!h && typeof h.beatsPerMinuteMax === 'number');
    if (!hr.length) return null;
    // One window; were Google ever to split it, the highest of them, and no average.
    return { avg: hr.length === 1 ? hr[0].beatsPerMinuteAvg ?? null : null, max: Math.max(...hr.map((h) => h.beatsPerMinuteMax)) };
  } catch { return null; }
}

async function fitbitTennis(uid: string, since: Date): Promise<Found> {
  const out: Found = { sessions: [], tennisIds: new Set(), complete: false, refused: false };
  // Google lists workouts newest first, 25 to a page, and picks them only by
  // the local time they started: so from a day early, as Fitbit's own list
  // did. A workout that started before that ends the list.
  const early = since.getTime() - 86_400_000;
  let filter: string | null = `exercise.interval.civil_start_time >= "${day(new Date(early))}"`;
  // Only workouts a Google or Fitbit tracker recorded (a Fitbit, a Pixel
  // Watch): Google's own definition ("google-wearables"), which leaves out
  // other apps' workouts and ones typed in by hand. fitbitFromOtherApp stays
  // as the backstop for when Google refuses this.
  let family: string | null = 'users/me/dataSourceFamilies/google-wearables';
  let retries = 0;
  const tennis: FitbitExercise[] = [];
  let next = '';
  for (let i = 0; i < 8; i += 1) {
    const q = new URLSearchParams({ pageSize: '25', ...(filter ? { filter } : {}), ...(family ? { dataSourceFamily: family } : {}), ...(next ? { pageToken: next } : {}) });
    const res = await apiGet(uid, 'fitbit', `${GOOGLE_HEALTH}/dataTypes/exercise/dataPoints?${q.toString().replace(/\+/g, '%20')}`);
    if (!res) return out;
    if (!res.ok) {
      const no = await googleError(res);
      const unlinked = no.reasons.includes('ACCOUNT_NOT_LINKED');
      // One report (June 2026) of Google refusing this filter. Its exact code
      // may sit only in detailedReasons under a general reason, so any 400 on
      // the first page counts: ask again without the part Google named (the
      // source family), else the filter, then the other. Newest come first,
      // so the day early still ends the list.
      if (res.status === 400 && !next && !unlinked && retries < 2 && (filter || family)) {
        if (family && (!filter || no.reasons.some((r) => r.includes('SOURCE_FAMILY')))) family = null; else filter = null;
        retries += 1; i -= 1; continue;
      }
      console.error('[trackers] fitbit list', said(res.status, no));
      // Only the player's own account turns tennis off (and the app offers to
      // connect again): their Google account has no Google Health profile any
      // more, or the yes to their workouts is missing. Any other refusal is
      // Google's side or CourtSide's project (API_PRIVATE_PREVIEW_ACCESS_DENIED,
      // DATA_ACCESS_DENIED, the API switched off, …): logged, tennis left on,
      // tried again next sync. A player taking back the whole yes shows up as
      // invalid_grant on the refresh instead (tokensFor).
      if (unlinked || no.reasons.some((r) => SCOPE_GONE.has(r))) out.refused = true;
      return out;
    }
    const body = await res.json() as { dataPoints?: FitbitExercise[]; nextPageToken?: string };
    let ended = false;
    for (const e of body.dataPoints ?? []) {
      if (Date.parse(e.exercise?.interval?.startTime ?? '') < early) { ended = true; continue; }
      if (fitbitIsTennis(e) && !fitbitFromOtherApp(e)) tennis.push(e);
    }
    next = body.nextPageToken ?? '';
    if (!next || ended) { out.complete = true; break; }
  }
  for (const e of tennis) {
    const s = fitbitSession(e);
    if (!s) continue;
    out.tennisIds.add(s.ext);
    if (Date.parse(s.payload.ended_at) < since.getTime()) continue;
    out.sessions.push(fitbitSession(e, await fitbitHeart(uid, e)) ?? s);
  }
  return out;
}

async function ouraTennis(uid: string, since: Date): Promise<Found> {
  const out: Found = { sessions: [], tennisIds: new Set(), complete: false, refused: false };
  const end = new Date(Date.now() + 86_400_000);
  const tennis: OuraWorkout[] = [];
  let next: string | undefined;
  for (let i = 0; i < 3; i += 1) {
    const q = new URLSearchParams({ start_date: day(new Date(since.getTime() - 86_400_000)), end_date: day(end), ...(next ? { next_token: next } : {}) });
    const res = await apiGet(uid, 'oura', `https://api.ouraring.com/v2/usercollection/workout?${q}`);
    if (!res) return out;
    if (res.status === 401 || res.status === 403) { await res.body?.cancel(); out.refused = true; return out; }
    if (!res.ok) { await res.body?.cancel(); return out; }
    const body = await res.json() as { data?: OuraWorkout[]; next_token?: string | null };
    tennis.push(...(body.data ?? []).filter(ouraIsTennis));
    next = body.next_token ?? undefined;
    if (!next) { out.complete = true; break; }
  }
  for (const w of tennis) {
    out.tennisIds.add(String(w.id));
    if (Date.parse(w.end_datetime ?? '') < since.getTime()) continue;
    // Heart rate during it, when the player let CourtSide read it. Best effort.
    let beats: OuraBeat[] = [];
    try {
      const q = new URLSearchParams({ start_datetime: w.start_datetime ?? '', end_datetime: w.end_datetime ?? '' });
      const hr = await apiGet(uid, 'oura', `https://api.ouraring.com/v2/usercollection/heartrate?${q}`);
      if (hr?.ok) beats = ((await hr.json()) as { data?: OuraBeat[] }).data ?? [];
      else await hr?.body?.cancel();
    } catch { /* no heart rate, still the session */ }
    const s = ouraSession(w, beats);
    if (s) out.sessions.push(s);
  }
  return out;
}

async function polarTennis(uid: string, since: Date): Promise<Found> {
  const out: Found = { sessions: [], tennisIds: new Set(), complete: false, refused: false };
  // Polar lists every exercise of the last 30 days in one go.
  const res = await apiGet(uid, 'polar', 'https://www.polaraccesslink.com/v3/exercises');
  if (!res) return out;
  if (res.status === 401 || res.status === 403) { await res.body?.cancel(); out.refused = true; return out; }
  if (res.status === 204) { out.complete = true; return out; }
  if (!res.ok) { await res.body?.cancel(); return out; }
  const list = await res.json().catch(() => []) as PolarExercise[];
  for (const e of Array.isArray(list) ? list : []) {
    if (!polarIsTennis(e)) continue;
    const s = polarSession(e);
    if (!s) continue;
    out.tennisIds.add(s.ext);
    if (Date.parse(s.payload.ended_at) >= since.getTime()) out.sessions.push(s);
  }
  out.complete = true;
  return out;
}

const FIND: Record<ProviderId, (uid: string, since: Date) => Promise<Found>> = { fitbit: fitbitTennis, oura: ouraTennis, polar: polarTennis };

/**
 * Files tennis from the last `hours`, quietly (the app shows its own banner).
 * A session the tracker no longer lists as tennis (deleted, or changed) is
 * taken back, unless it was logged, as WHOOP's are. Returns the ids just filed.
 */
async function syncTennis(uid: string, p: ProviderId, hours: number): Promise<string[]> {
  const { data: ok } = await admin.rpc('tennis_allowed', { u: uid, src: p });
  if (ok !== true) return [];
  const since = new Date(Date.now() - hours * 3_600_000);
  const found = await FIND[p](uid, since);
  if (found.refused) { await setReadsWorkouts(uid, p, false); return []; }
  const fresh: string[] = [];
  for (const s of found.sessions) {
    const { data, error } = await admin.rpc('record_activity', { u: uid, src: p, ext: s.ext, p: s.payload, quiet: true });
    if (error) { console.error(`[trackers] ${p} record`, error.message); continue; }
    if (data?.note === 'filed' || data?.note === 'pushed') fresh.push(data.id);
  }
  if (found.complete) {
    const { data: mine } = await admin.from('detected_activities').select('external_id').eq('user_id', uid).eq('source', p)
      .in('status', ['new', 'duplicate']).gte('started_at', since.toISOString()).lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    for (const m of (mine ?? []) as { external_id: string }[]) {
      if (!found.tennisIds.has(m.external_id)) await admin.rpc('withdraw_activity', { u: uid, src: p, ext: m.external_id });
    }
  }
  await admin.from('health_connections').update({ last_synced_at: new Date().toISOString() }).match({ user_id: uid, provider: p });
  return fresh;
}

/** Puts a collected sign-in on this account, turns tennis sessions on, and looks through the past week (each one lands in Notifications to log). */
async function link(uid: string, p: ProviderId, a: Answer): Promise<{ error?: string; fresh: string[] }> {
  const { error } = await admin.from('tracker_tokens').upsert({
    user_id: uid, provider: p, access_token: a.access_token, refresh_token: a.refresh_token, expires_at: a.expires_at,
    scope: a.scope, member_id: a.member, refresh_lock_until: null, updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message, fresh: [] };
  const { error: e2 } = await admin.from('health_connections').upsert({ user_id: uid, provider: p, connected_at: new Date().toISOString(), reads_workouts: true });
  if (e2) return { error: e2.message, fresh: [] };
  let fresh: string[] = [];
  try { fresh = await syncTennis(uid, p, 168); } catch (e) { console.error(`[trackers] ${p} first sync`, e); }
  return { fresh };
}

/** Tells the tracker CourtSide's access is withdrawn. Best effort. */
async function revoke(uid: string, p: ProviderId) {
  const row = await tokenRow(uid, p);
  if (!row) return;
  const t = AbortSignal.timeout(8_000);
  try {
    if (p === 'fitbit') {
      // The refresh key, so the whole yes goes (Google needs no secret for this).
      await googleRevoke(row.refresh_token ?? row.access_token);
    } else if (p === 'oura') {
      await fetch(`https://api.ouraring.com/oauth/revoke?${new URLSearchParams({ access_token: row.access_token })}`, { signal: t }).then((r) => r.body?.cancel());
    } else if (row.member_id) {
      await fetch(`https://www.polaraccesslink.com/v3/users/${encodeURIComponent(row.member_id)}`, { method: 'DELETE', signal: t, headers: { authorization: `Bearer ${row.access_token}` } }).then((r) => r.body?.cancel());
    }
  } catch { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/trackers/, '');

  if (path === '/status' || path === '' || path === '/') {
    return json(Object.fromEntries(PROVIDERS.map((p) => [p, { on: isSetUp(p) }])));
  }

  const back = /^\/callback\/([a-z]+)$/.exec(path);
  if (back) {
    const p = back[1];
    const q = new URL(req.url).searchParams;
    const opened = q.get('state') ? await open(q.get('state')!) : null;
    const to = safeBack(opened?.back ?? 'courtside://health');
    const go = (result: string) => Response.redirect(`${to}${to.includes('?') ? '&' : '?'}tracker=${result}`, 302);
    if (!isProvider(p) || !opened || opened.p !== p || !q.get('code')) return go('refused');
    if (!(typeof opened.exp === 'number' && opened.exp > Date.now())) return go('expired');
    if (!isSetUp(p)) return go('failed');
    const r = await tokenCall(p, {
      grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: redirectFor(p),
      ...(CONFIG[p].pkce ? { code_verifier: await verifierFor(opened.n) } : {}),
    });
    if (!r.ok) { console.error(`[trackers] ${p} code`, r.error); return go('failed'); }
    const t = r.t;
    const answer: Answer = {
      access_token: String(t.access_token), refresh_token: typeof t.refresh_token === 'string' ? t.refresh_token : null,
      expires_at: expiry(t), scope: typeof t.scope === 'string' ? t.scope : null,
      member: p === 'polar' && t.x_user_id != null ? String(t.x_user_id) : null,
    };
    if (p === 'fitbit') {
      // A sign-in that cannot be used is handed straight back to Google.
      const drop = async (result: string) => { await googleRevoke(answer.refresh_token ?? answer.access_token); return go(result); };
      // Google lets the player untick what CourtSide asks for. Without their
      // workouts there is nothing to connect; without heart rate, sessions
      // come in without their highest beat.
      if (answer.scope != null && !answer.scope.split(/\s+/).includes(FITBIT_WORKOUTS)) return drop('refused');
      // Always sent with access_type=offline and prompt=consent; without one the sign-in would die within the hour.
      if (!answer.refresh_token) { console.error('[trackers] fitbit: no refresh key'); return drop('failed'); }
      // Google's answer names no account, so ask Google Health who this is.
      // Google's rule: never call a Fitbit connected before this answers. A
      // Google account with no Google Health profile yet (its Fitbit not moved
      // over) says ACCOUNT_NOT_LINKED, and the app says what to do.
      const who = await fetch(`${GOOGLE_HEALTH}/identity`, { headers: { authorization: `Bearer ${answer.access_token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!who?.ok) {
        const no: GoogleNo = who ? await googleError(who) : { reasons: [], message: '' };
        console.error('[trackers] fitbit identity', said(who?.status, no));
        const why = no.reasons;
        // Google has not let CourtSide's project in (its private preview), or
        // the API is not switched on in it: "Fitbit isn't available yet".
        // Another 403 about the player (Google's troubleshooting: a legacy
        // Fitbit login agreed instead of a Google account) gets the same
        // advice as no Google Health profile: sign in to Google Health with Google.
        return drop(why.includes('ACCOUNT_NOT_LINKED') ? 'notlinked'
          : why.some((r) => NOT_OPEN.has(r)) ? 'unavailable'
          : who?.status === 403 && !why.some((r) => r === 'DISALLOWED_OAUTH_SCOPES' || SCOPE_GONE.has(r)) ? 'notlinked'
          : 'failed');
      }
      const id = await who.json().catch(() => ({})) as { healthUserId?: unknown };
      // Google's id for the player in its Health API (1 to 63 letters), as Fitbit's own user id was kept.
      answer.member = typeof id.healthUserId === 'string' && id.healthUserId && id.healthUserId.length <= 100 ? id.healthUserId : null;
    }
    if (p === 'polar') {
      // Polar shares a person's data only once they are registered with CourtSide's app (409: already are).
      const reg = await fetch('https://www.polaraccesslink.com/v3/users', { method: 'POST', headers: { authorization: `Bearer ${answer.access_token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ 'member-id': crypto.randomUUID() }) }).catch(() => null);
      await reg?.body?.cancel();
      if (!reg || !(reg.ok || reg.status === 409)) { console.error('[trackers] polar register', reg?.status); return go('failed'); }
    }
    // Parked until the phone that started this collects it, under a fresh code only this browser sees.
    const n = crypto.randomUUID();
    await admin.from('tracker_pending').delete().lt('expires_at', new Date().toISOString());
    const { error } = await admin.from('tracker_pending').insert({ n, user_id: opened.uid, provider: p, answer, expires_at: new Date(Date.now() + SIGN_IN_MS).toISOString() });
    if (error) { console.error('[trackers] pending', error.message); return go('failed'); }
    return go(`pending&p=${p}&n=${n}`);
  }

  const uid = await whoIs(req);
  if (!uid) return json({ error: 'Sign in first.' }, 401);
  const posted = await req.json().catch(() => ({})) as { provider?: unknown; back?: unknown; n?: unknown; days?: unknown };

  if (path === '/finish') {
    const n = typeof posted.n === 'string' && /^[0-9a-f-]{36}$/i.test(posted.n) ? posted.n : null;
    // Collected once, and only by the account that started it (someone else
    // holding the code cannot use it up). Refusals answer 200 with the sentence the app shows.
    const { data: taken } = n ? await admin.from('tracker_pending').delete().eq('n', n).eq('user_id', uid).select() : { data: null };
    const got = ((taken ?? []) as { user_id: string; provider: ProviderId; answer: Answer; expires_at: string }[])[0];
    if (!got && n) {
      const { data: theirs } = await admin.from('tracker_pending').select('n').eq('n', n).gt('expires_at', new Date().toISOString()).limit(1);
      if ((theirs ?? []).length) return json({ error: 'That sign-in was started on another account.' });
    }
    if (!got || Date.parse(got.expires_at) < Date.now()) return json({ error: 'That sign-in has expired. Try again.' });
    const r = await link(uid, got.provider, got.answer);
    if (r.error) { console.error('[trackers] link', r.error); return json({ error: `Could not connect ${NAME[got.provider]} right now. Try again.` }); }
    return json({ ok: true, provider: got.provider, fresh: r.fresh });
  }

  const p = posted.provider;
  if (!isProvider(p)) return json({ error: 'Unknown tracker.' }, 400);

  if (path === '/start') {
    if (!isSetUp(p)) return json({ on: false });
    const { data: allowed } = await admin.rpc('flag_on_for', { flag: `tennis-${p}`, u: uid });
    if (allowed !== true) return json({ on: false });
    const c = CONFIG[p];
    const n = crypto.randomUUID();
    const state = await sign({ uid, back: safeBack(typeof posted.back === 'string' ? posted.back : 'courtside://health'), p, n, exp: Date.now() + SIGN_IN_MS });
    const q = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: redirectFor(p), scope: c.scope, state });
    if (c.pkce) { q.set('code_challenge', await challengeOf(await verifierFor(n))); q.set('code_challenge_method', 'S256'); }
    for (const [k, v] of Object.entries(c.extra ?? {})) q.set(k, v);
    return json({ on: true, url: `${c.auth}?${q}` });
  }

  if (path === '/sync') {
    if (!(await tokenRow(uid, p))) return json({ error: `${NAME[p]} is not connected.` }, 400);
    const days = typeof posted.days === 'number' && posted.days > 0 ? Math.min(posted.days, 7) : 1.5;
    try { return json({ fresh: await syncTennis(uid, p, days * 24), days }); } catch (e) { console.error(`[trackers] ${p} sync`, e); return json({ error: 'sync failed' }, 500); }
  }

  if (path === '/disconnect') {
    // Tennis off first, so no sync files a session while the rest is removed.
    await setReadsWorkouts(uid, p, false);
    await revoke(uid, p);
    // Then remove what it sent. If that fails, keep the keys so trying again finishes the job.
    const { error } = await admin.rpc('forget_tracker_data', { u: uid, prov: p });
    if (error) { console.error('[trackers] forget', error.message); return json({ error: `Could not disconnect ${NAME[p]} right now.` }, 500); }
    await admin.from('tracker_tokens').delete().match({ user_id: uid, provider: p });
    await admin.from('health_connections').delete().match({ user_id: uid, provider: p });
    return json({ ok: true });
  }

  return json({ error: 'unknown path' }, 404);
});
