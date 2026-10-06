import type { LatLng } from '@/features/players/positions';

/** The still card shows the whole metro (Oct 3): wide enough that nearby players are on it, so the courts spread out. */
export const CARD_ZOOM = 10.4;
/** Never further out than about a state, however spread out the players it counts are. */
const CARD_MIN_ZOOM = 6.5;
/** The card's height on the Find Players tab (the same on the phone and in a browser). */
export const CARD_HEIGHT = 330;
/** Kept clear for a player's face (34 across) and a little air: no pin is cut by the card's edge. */
const EDGE = 26;
/** Kept clear at the top for the city's name and its lines ("8 players around", "3 open hits nearby"). */
const NAME_BAND = 96;

/** Web Mercator, as the map draws it: where a spot sits on a 512-wide world at zoom 0. */
function project({ lat, lng }: LatLng): { x: number; y: number } {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * 512, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 };
}
function unproject({ x, y }: { x: number; y: number }): LatLng {
  const n = Math.PI - (2 * Math.PI * y) / 512;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / 512) * 360 - 180 };
}

/**
 * Where the still card looks, and how far in: your city at CARD_ZOOM when
 * everyone it counts is already on it, as before. When some of them are
 * further out (Oct 6, owner: "Raleigh · 8 players around" over a map with
 * no one on it — the players were in Wake Forest and Durham, inside the 30
 * miles the count reaches but off a card that showed 5), it takes in the city
 * and all of them instead, clear of the name at the top and the card's
 * edges, so the count and the faces on the map always agree.
 */
export function cardView(city: LatLng, spots: LatLng[], width: number, height = CARD_HEIGHT): { center: LatLng; zoom: number } {
  const fallback = { center: city, zoom: CARD_ZOOM };
  if (!spots.length || width <= 2 * EDGE) return fallback;
  const c = project(city);
  const scale = 2 ** CARD_ZOOM;
  const fits = spots.every((spot) => {
    const p = project(spot);
    const dx = Math.abs(p.x - c.x) * scale;
    const dy = (p.y - c.y) * scale;
    return dx <= width / 2 - EDGE && (dy < 0 ? -dy <= height / 2 - NAME_BAND : dy <= height / 2 - EDGE);
  });
  if (fits) return fallback;
  // The box around the city and everyone counted, fitted into what the card leaves clear.
  const all = [c, ...spots.map(project)];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const roomX = width - 2 * EDGE;
  const roomY = height - NAME_BAND - EDGE;
  const fit = Math.min(maxX > minX ? roomX / (maxX - minX) : Infinity, maxY > minY ? roomY / (maxY - minY) : Infinity);
  const zoom = Math.max(CARD_MIN_ZOOM, Math.min(CARD_ZOOM, Math.log2(fit)));
  const at = 2 ** zoom;
  // The box's middle sits in the middle of the clear part, which is lower than the card's middle by half the name band's extra.
  const center = unproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 - (NAME_BAND - EDGE) / 2 / at });
  return { center, zoom: Math.round(zoom * 100) / 100 };
}
