import { useEffect, useState } from 'react';
import { weatherAt, type Weather } from '@/lib/weather';
import type { LatLng } from '@/features/players/positions';

/** The weather at a spot on the map, fetched once the spot settles. */
export function useWeather(at: LatLng): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const lat = at.lat.toFixed(2);
  const lng = at.lng.toFixed(2);
  useEffect(() => {
    let alive = true;
    weatherAt(Number(lat), Number(lng)).then((w) => { if (alive) setWeather(w); });
    return () => { alive = false; };
  }, [lat, lng]);
  return weather;
}
