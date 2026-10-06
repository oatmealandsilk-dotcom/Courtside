import type { LatLng } from '@/features/players/positions';

/** The still card shows the whole metro (Oct 3): wide enough that nearby players are on it, so the courts spread out. One step wider on Oct 6 (owner: "zoom out a bit"), about 10 miles round the city instead of 5. */
export const CARD_ZOOM = 9.7;
/** The card's height on the Find Players tab (the same on the phone and in a browser). */
export const CARD_HEIGHT = 330;
/** A face whose middle is closer to the card's edge than this is mostly cut off: not counted as on the card. */
const EDGE = 8;

/** Web Mercator, as the map draws it: where a spot sits on a 512-wide world at zoom 0. */
function project({ lat, lng }: LatLng): { x: number; y: number } {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * 512, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 };
}

/**
 * Whether a player's pin is on the still card: the card stays where it always
 * was (your city in the middle at CARD_ZOOM), and its "N players around"
 * counts only the faces you can see on it (Oct 6, owner: "Raleigh · 8 players
 * around" over a map with no one on it, because the count reached 30 miles
 * and the card shows about 5; moving the card to take everyone in was undone
 * the same day: "the map is still not centered").
 */
export function onCard(center: LatLng, spot: LatLng, width: number, height = CARD_HEIGHT): boolean {
  if (width <= 0) return false;
  const c = project(center);
  const p = project(spot);
  const scale = 2 ** CARD_ZOOM;
  const dx = Math.abs(p.x - c.x) * scale;
  const dy = Math.abs(p.y - c.y) * scale;
  return dx <= width / 2 - EDGE && dy <= height / 2 - EDGE;
}

/** The card's location switch, top right (MapChrome previewSwitch: 32 round, 12 in from each edge), with half a face round it. */
const SWITCH_CORNER = 12 + 32 + 16;

/**
 * Whether a player's pin would land under the card's location switch: such
 * a pin is left off the card (and out of its count), so a far face never
 * sits on top of the switch, half covering "Turn location on" (Oct 6 sweep).
 */
export function underCardSwitch(center: LatLng, spot: LatLng, width: number, height = CARD_HEIGHT): boolean {
  if (width <= 0) return false;
  const c = project(center);
  const p = project(spot);
  const scale = 2 ** CARD_ZOOM;
  const x = width / 2 + (p.x - c.x) * scale;
  const y = height / 2 + (p.y - c.y) * scale;
  return x >= width - SWITCH_CORNER && y <= SWITCH_CORNER;
}
