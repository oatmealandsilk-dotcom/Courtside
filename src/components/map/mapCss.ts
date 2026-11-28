/**
 * The map engine's stylesheet (MapLibre's own, 83 KB), fetched with the engine rather than in the page's head.
 * Imported at the top of the app it was a render-blocking file on every page, map or not (Nov 27 speed pass).
 * public/maplibre/maplibre-gl.css is a copy of node_modules/maplibre-gl/dist/maplibre-gl.css (6.9.1):
 * after upgrading maplibre-gl, copy it again. Resolves once it has loaded (or failed, or 4 s): the map is
 * drawn only after it, so its canvas and markers are never laid out unstyled.
 */
const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
let loading: Promise<void> | null = null;

export function loadMapCss(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  return (loading ??= new Promise<void>((done) => {
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${BASE}/maplibre/maplibre-gl.css`;
      link.onload = () => done();
      link.onerror = () => done();
      document.head.appendChild(link);
      setTimeout(done, 4000);
    } catch {
      done();
    }
  }));
}
