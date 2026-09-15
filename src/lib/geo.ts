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

async function fromDevice(): Promise<GeoResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };
    const fix = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
    ]);
    if (!fix) {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return { ok: false, reason: 'timeout' };
      return { ok: true, lat: last.coords.latitude, lng: last.coords.longitude };
    }
    return { ok: true, lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

function fromBrowser(): Promise<GeoResult> {
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
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    } catch {
      done({ ok: false, reason: 'unavailable' });
    }
    setTimeout(() => done({ ok: false, reason: 'timeout' }), 9000);
  });
}

export function getPosition(): Promise<GeoResult> {
  return Platform.OS === 'web' ? fromBrowser() : fromDevice();
}
