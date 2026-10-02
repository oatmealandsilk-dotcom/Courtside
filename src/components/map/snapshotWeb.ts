import * as maplibregl from 'maplibre-gl';

import { STYLE, applyLook, type Look } from '@/components/map/look';

// The map engine's background worker ships in public/ (see WebMap): pointed
// at again here, since this file can load before the big map ever has.
const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
maplibregl.setWorkerUrl(`${BASE}/maplibre/maplibre-gl-worker.mjs`);

/**
 * Draws a spot of the map off screen and hands back a picture of it (a
 * JPEG), then closes the engine. Only loaded by CourtMapThumb in a browser,
 * on first need, so the engine is not part of the app's first download.
 */
export function snapshotMap({ lat, lng, zoom, width, height, look }: { lat: number; lng: number; zoom: number; width: number; height: number; look: Look }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
    document.body.appendChild(box);
    let map: maplibregl.Map | null = null;
    let over = false;
    const finish = (fn: () => void) => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      try { map?.remove(); } catch { /* already gone */ }
      box.remove();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('map took too long'))), 15_000);
    try {
      map = new maplibregl.Map({
        container: box,
        style: STYLE,
        center: [lng, lat],
        zoom,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        pixelRatio: 2,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      const drawn = map;
      drawn.on('load', () => {
        applyLook(drawn, look);
        drawn.once('idle', () => {
          try {
            drawn.getCanvas().toBlob((picture) => finish(() => (picture ? resolve(picture) : reject(new Error('no picture')))), 'image/jpeg', 0.86);
          } catch (e) {
            finish(() => reject(e));
          }
        });
      });
    } catch (e) {
      finish(() => reject(e));
    }
  });
}
