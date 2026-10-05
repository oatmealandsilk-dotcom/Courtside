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
 */
interface Ask { recentMs?: number; quiet?: boolean }

async function fromDevice({ recentMs, quiet }: Ask): Promise<GeoResult> {
  try {
    const perm = quiet ? await Location.getForegroundPermissionsAsync() : await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: quiet && perm.canAskAgain ? 'unavailable' : 'denied' };
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

export function getPosition(ask: Ask = {}): Promise<GeoResult> {
  return Platform.OS === 'web' ? fromBrowser(ask) : fromDevice(ask);
}
