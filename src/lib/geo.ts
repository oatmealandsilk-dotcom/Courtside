/**
 * Where the device says it is, through the browser's own permission prompt.
 *
 * Uses the standard `navigator.geolocation` so the phone or computer handles
 * asking, remembering, and revoking — nothing is stored here. On the native
 * apps that object does not exist without expo-location, so the answer there
 * is "unavailable" rather than a crash.
 */
export type GeoResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'unavailable' | 'denied' | 'timeout' };

export function getPosition(): Promise<GeoResult> {
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
