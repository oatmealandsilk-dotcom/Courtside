import { useEffect, useState } from 'react';
import { weatherAt, type Weather } from '@/lib/weather';
import type { LatLng } from '@/features/players/positions';

/** The weather at a spot on the map, fetched once the spot settles. No spot yet (null): nothing is asked. */
export function useWeather(at: LatLng | null): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const lat = at ? at.lat.toFixed(2) : null;
  const lng = at ? at.lng.toFixed(2) : null;
  useEffect(() => {
    if (lat === null || lng === null) return undefined;
    let alive = true;
    weatherAt(Number(lat), Number(lng)).then((w) => { if (alive) setWeather(w); });
    return () => { alive = false; };
  }, [lat, lng]);
  return weather;
}
