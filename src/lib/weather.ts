/**
 * The weather where the map is centred, from Open-Meteo — a free public
 * forecast service that needs no account or key. One small fetch per spot,
 * remembered for ten minutes so a map that re-draws does not ask again.
 */
export interface Weather { tempF: number; label: string; icon: string }

const TEN_MINUTES = 10 * 60_000;
const cache = new Map<string, { at: number; weather: Weather | null }>();

/** WMO weather codes, folded to a word and an icon. */
function describe(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Sunny', icon: 'sunny-outline' };
  if (code <= 2) return { label: 'Partly cloudy', icon: 'partly-sunny-outline' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloud-outline' };
  if (code <= 48) return { label: 'Foggy', icon: 'cloud-outline' };
  if (code <= 57) return { label: 'Drizzle', icon: 'rainy-outline' };
  if (code <= 67) return { label: 'Rain', icon: 'rainy-outline' };
  if (code <= 77) return { label: 'Snow', icon: 'snow-outline' };
  if (code <= 82) return { label: 'Showers', icon: 'rainy-outline' };
  if (code <= 86) return { label: 'Snow showers', icon: 'snow-outline' };
  return { label: 'Storms', icon: 'thunderstorm-outline' };
}

export async function weatherAt(lat: number, lng: number): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.weather;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    const weather = typeof temp === 'number' && typeof code === 'number' ? { tempF: Math.round(temp), ...describe(code) } : null;
    cache.set(key, { at: Date.now(), weather });
    return weather;
  } catch {
    cache.set(key, { at: Date.now(), weather: null });
    return null;
  }
}
