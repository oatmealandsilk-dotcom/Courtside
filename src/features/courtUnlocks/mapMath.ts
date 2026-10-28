/*
 * DESIGN BRANCH ONLY (design/court-unlocks, round 3): where a spot falls on
 * one of the court map pictures, so a court can be drawn on the picture at
 * its real place and size. The pictures are the map engine's own (MapLibre),
 * whose world is 512 points wide at zoom 0 and doubles with each zoom step.
 * Plain numbers, so the zoom-out moment can run them on the UI thread.
 */

const TILE = 512;
const EARTH = 40075016.686;

/** Across the world, 0 to 1, west to east. */
export function worldX(lng: number): number {
  'worklet';
  return (lng + 180) / 360;
}

/** Down the world, 0 to 1, north to south (Web Mercator). */
export function worldY(lat: number): number {
  'worklet';
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;
export const lngOf = (x: number) => x * 360 - 180;

/** How many points the whole world is across at a zoom. */
export function worldSize(zoom: number): number {
  'worklet';
  return TILE * Math.pow(2, zoom);
}

/** Points per metre on the ground at a zoom and latitude. */
export const pxPerMetre = (zoom: number, lat: number) => worldSize(zoom) / (EARTH * Math.cos((lat * Math.PI) / 180));

/** The latitude to centre a picture on so a spot sits `fromTop` of the way down it (0.5: the middle). */
export function centreLatFor(lat: number, zoom: number, height: number, fromTop: number): number {
  return latOf(worldY(lat) + ((0.5 - fromTop) * height) / worldSize(zoom));
}
