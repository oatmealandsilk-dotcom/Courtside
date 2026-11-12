import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Where the device says it is, through its own permission prompt.
 *
 * The browser goes through `navigator.geolocation`; the phone through
 * expo-location. Either way the device handles asking, remembering, and
 * revoking — nothing is stored here.
 */
export type GeoResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'unavailable' | 'denied' | 'timeout' };

/**
 * `recentMs`: the oldest answer that will do. Without it, a phone that cannot
 * get a fix in time falls back on the last place it knew, however old (fine
 * for a city); with it, an older one counts as no answer (for "where are you
 * standing right now").
 *
 * `quiet`: never shows the device's own prompt. Only a device that already
 * allows it answers; one that would have to ask counts as 'unavailable'
 * (for checking again in the background, which must never pop a question).
 *
 * `onAllowed`: the phone has said the app may know where it is (its own
 * question answered yes, or yes before), told before it starts finding you
 * (the check-in zoom readies its pictures then). Not told in a browser.
 */
interface Ask { recentMs?: number; quiet?: boolean; onAllowed?: () => void }

async function fromDevice({ recentMs, quiet, onAllowed }: Ask): Promise<GeoResult> {
  try {
    const perm = quiet ? await Location.getForegroundPermissionsAsync() : await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: quiet && perm.canAskAgain ? 'unavailable' : 'denied' };
    try { onAllowed?.(); } catch { /* only a head start */ }
    const fix = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
    ]);
    if (!fix) {
      const last = await Location.getLastKnownPositionAsync(recentMs ? { maxAge: recentMs } : undefined);
      if (!last) return { ok: false, reason: 'timeout' };
      return { ok: true, lat: last.coords.latitude, lng: last.coords.longitude };
    }
    return { ok: true, lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** Whether this browser already lets the page know where it is, without asking (`quiet`). Unknown counts as no. */
async function browserAllows(): Promise<boolean> {
  try {
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!perms || typeof perms.query !== 'function') return false;
    return (await perms.query({ name: 'geolocation' as PermissionName })).state === 'granted';
  } catch {
    return false;
  }
}

async function fromBrowser({ recentMs, quiet }: Ask): Promise<GeoResult> {
  if (quiet && !(await browserAllows())) return { ok: false, reason: 'unavailable' };
  return new Promise((resolve) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    let settled = false;
    const done = (result: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      geo.getCurrentPosition(
        (position) => done({ ok: true, lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => done({ ok: false, reason: error.code === 1 ? 'denied' : 'timeout' }),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: recentMs ?? 300000 },
      );
    } catch {
      done({ ok: false, reason: 'unavailable' });
    }
    setTimeout(() => done({ ok: false, reason: 'timeout' }), 9000);
  });
}

/** The last place the device answered with this session, and when (only in memory, never kept or sent). */
let lastFix: { lat: number; lng: number; at: number } | null = null;

export function getPosition(ask: Ask = {}): Promise<GeoResult> {
  return (Platform.OS === 'web' ? fromBrowser(ask) : fromDevice(ask)).then((r) => {
    if (r.ok) lastFix = { lat: r.lat, lng: r.lng, at: Date.now() };
    return r;
  });
}

/**
 * Whether the device already lets the app know where it is, without asking anything (no prompt, ever).
 * Unknown counts as no. Up to hit uses it to turn on at once for someone who has said yes before.
 */
export async function locationAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return browserAllows();
  try { return (await Location.getForegroundPermissionsAsync()).granted; } catch { return false; }
}

/**
 * Whether a tap would bring Apple's own location question on this iPhone or iPad (never asked, an "Allow Once" run
 * out, or "Ask Next Time"). Read quietly, never asking. Always false off iOS. Apple 5.1.1(iv), Nov 12: while it would,
 * no note or card of ours with a way out may carry a button that leads to that question.
 */
export async function appleWouldAsk(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try { return (await Location.getForegroundPermissionsAsync()).status === Location.PermissionStatus.UNDETERMINED; } catch { return false; }
}

/** The one question asked by appleLocationFirst while it is up, so two quick taps share it. */
let appleAsking: Promise<'granted' | 'denied' | null> | null = null;

/**
 * Apple's own location question first, on an iPhone or iPad that has never been asked (or whose "Allow Once" has run
 * out, or that is set to "Ask Next Time"): Apple 5.1.1(iv), Nov 12. No card of ours with a way out on it ("Who can
 * see you on the map?", "Up to hit?", "How long are you here?", all with Not now) may stand in front of Apple's
 * question, so the tap on Up to hit, I'm playing here or Show friends asks Apple straight away, and the card follows
 * Apple's answer (which Apple allows). It shares nothing: it only asks whether the phone may know where it is.
 * 'granted' or 'denied': Apple asked, and that was the answer. null: nothing was asked (Android, the website, or a
 * phone that already answered), so the flow goes on exactly as before; anything going wrong is null too, never a crash.
 */
export function appleLocationFirst(): Promise<'granted' | 'denied' | null> {
  if (Platform.OS !== 'ios') return Promise.resolve(null);
  if (appleAsking) return appleAsking;
  const ask = (async (): Promise<'granted' | 'denied' | null> => {
    try {
      if ((await Location.getForegroundPermissionsAsync()).status !== Location.PermissionStatus.UNDETERMINED) return null;
      return (await Location.requestForegroundPermissionsAsync()).granted ? 'granted' : 'denied';
    } catch {
      return null;
    }
  })();
  appleAsking = ask;
  void ask.then(() => { if (appleAsking === ask) appleAsking = null; });
  return ask;
}

/**
 * Where the device last said it was, if that is at most `maxMs` old: this session's own last answer, else (on a
 * phone) the one the phone itself keeps. Never asks anything and never waits for a new reading; null otherwise.
 */
export async function recentPosition(maxMs: number): Promise<{ lat: number; lng: number } | null> {
  if (lastFix && Date.now() - lastFix.at <= maxMs) return { lat: lastFix.lat, lng: lastFix.lng };
  if (Platform.OS === 'web') return null;
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: maxMs });
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}
