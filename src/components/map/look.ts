/**
 * The map's look, shared by the browser canvas (MapLibre in the page) and
 * the phone canvas (the same MapLibre inside a web view): OpenFreeMap's
 * plainest style, recoloured into the app's own theme.
 */
/** The few MapLibre calls the recolouring needs, so this file has no MapLibre import of its own. */
export interface LookMap {
  getLayer(id: string): unknown;
  setLayoutProperty(id: string, name: string, value: unknown): unknown;
  setPaintProperty(id: string, name: string, value: unknown): unknown;
  setLayerZoomRange(id: string, min: number, max: number): unknown;
}

/**
 * The plainest vector style OpenFreeMap offers (free, no key), recoloured
 * below into the soft, quiet look of Apple Maps: warm paper, white roads,
 * pale water and parks, and only the labels that matter.
 */
export const STYLE = 'https://tiles.openfreemap.org/styles/positron';

export type Look = Record<string, { fill?: string; line?: string; text?: string; halo?: string; hide?: boolean; /** Only from this zoom in — small roads appear once you are close. */ minZoom?: number; /** A line's opacity, as a MapLibre expression: how each kind of road fades in as you come closer. */ opacity?: unknown }>;

/** How long a kind of road takes to fade in, in zoom levels. */
const FADE = 0.8;
/**
 * Roads by importance, each fading in as you zoom closer and fully drawn at
 * its own zoom: { primary: 10.5, secondary: 12.6 } shows the main roads
 * across a city and lets the next tier in a step closer. Any class not
 * named is always drawn.
 */
function fadeIn(byClass: Record<string, number>): unknown {
  const zooms = [...new Set(Object.values(byClass).flatMap((z) => [z - FADE, z]))].sort((a, b) => a - b);
  const at = (zoom: number, full: number) => Math.min(1, Math.max(0, (zoom - (full - FADE)) / FADE));
  const stops = zooms.flatMap((zoom) => [zoom, ['match', ['get', 'class'], ...Object.entries(byClass).flatMap(([kind, full]) => [kind, at(zoom, full)]), 1]]);
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}
/*
 * A city at a glance carries only its motorways and main roads; the next
 * tier comes in as you zoom toward a neighbourhood, and the small streets
 * only once you are down at street level, looking for a court.
 */
const MAJOR_ROADS = fadeIn({ trunk: 9, primary: 10.6, secondary: 12.6, tertiary: 13.6 });
const SMALL_ROADS = fadeIn({ minor: 14.6, service: 15.8, track: 15.8 });

/** The handful of palette colours the map is mixed from. */
export interface MapPalette { bg: string; surface: string; text: string; textMuted: string; brand: string; court: string; hard: string; clay: string; grass: string }

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const isDark = (c: string) => { const [r, g, b] = hex(c); return (r * 299 + g * 587 + b * 114) / 1000 < 128; };
/** `t` of the way from `a` to `b`. */
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a); const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/*
 * A clear, friendly map in the app's own colours, the way Apple Maps reads:
 * the ground is the theme's page, neighbourhoods a shade deeper, parks a
 * soft grass green, water a clean blue, roads white with a fine edge so they
 * stand off the ground. Detail arrives as you come closer: neighbourhood
 * names, then buildings and street names. No shields, no rail, no motorway
 * yellow. The pins are the point; the map stays quiet under them.
 */
export function lookFor(p: MapPalette): Look {
  const dark = isDark(p.bg);
  // A shade under the page, so white roads read on it the way they do on Apple's map.
  const ground = dark ? p.bg : mix(p.bg, p.text, 0.05);
  const built = mix(ground, p.text, dark ? 0.05 : 0.03);
  const building = mix(ground, p.text, dark ? 0.1 : 0.07);
  // Parks and water lean toward a fresh green and a clear blue, still tinted by the theme.
  const green = mix(p.grass, '#5FAE5A', 0.45);
  const blue = mix(p.hard, '#4B9BD8', 0.45);
  const park = dark ? mix(ground, green, 0.34) : mix(green, '#FFFFFF', 0.62);
  const wood = dark ? mix(ground, green, 0.42) : mix(green, '#FFFFFF', 0.55);
  const grass = dark ? mix(ground, green, 0.24) : mix(green, '#FFFFFF', 0.72);
  const water = dark ? mix(ground, blue, 0.5) : mix(blue, '#FFFFFF', 0.5);
  const road = dark ? mix(ground, p.text, 0.2) : '#FFFFFF';
  const edge = dark ? mix(ground, '#000000', 0.35) : mix(ground, p.text, 0.14);
  const big = dark ? mix(ground, p.text, 0.32) : mix('#FFFFFF', p.clay, 0.22);
  const bigEdge = dark ? mix(ground, '#000000', 0.4) : mix(big, p.text, 0.18);
  const tunnel = mix(ground, road, 0.5);
  const label = p.textMuted;
  const hidden = { hide: true };
  return {
    background: { fill: ground },
    landuse_residential: { fill: built, minZoom: 11 },
    park: { fill: park },
    landcover_wood: { fill: wood },
    landcover_grass: { fill: grass },
    water: { fill: water },
    waterway: { line: water },
    building: { fill: building, minZoom: 15 },
    highway_path: hidden,
    highway_minor: { line: road, minZoom: 13.7, opacity: SMALL_ROADS },
    highway_major_casing: { line: edge, minZoom: 9, opacity: MAJOR_ROADS },
    highway_major_inner: { line: road, minZoom: 9, opacity: MAJOR_ROADS },
    // The style's grey stand-in for every main road when zoomed out: the fades above do that job now.
    highway_major_subtle: hidden,
    highway_motorway_casing: { line: bigEdge },
    highway_motorway_inner: { line: big },
    highway_motorway_subtle: { line: big },
    highway_motorway_bridge_casing: { line: bigEdge },
    highway_motorway_bridge_inner: { line: big },
    tunnel_motorway_casing: hidden,
    tunnel_motorway_inner: { line: tunnel },
    railway: hidden, railway_transit: hidden, railway_service: hidden,
    railway_dashline: hidden, railway_transit_dashline: hidden, railway_service_dashline: hidden,
    boundary_2: hidden, boundary_3: hidden,
    'highway-name-path': hidden,
    'highway-name-minor': { text: label, halo: road, minZoom: 16 },
    'highway-name-major': { text: label, halo: road, minZoom: 14 },
    'highway-shield-non-us': hidden, 'highway-shield-us-interstate': hidden, road_shield_us: hidden,
    airport: hidden,
    // Neighbourhoods by name once you are down among them: "North Hills", "Five Points".
    label_other: { text: label, halo: ground, minZoom: 12.5 },
    label_village: { text: label, halo: ground, minZoom: 12 },
    label_town: { text: p.text, halo: ground, minZoom: 9 },
    label_city: { text: p.text, halo: ground },
    label_city_capital: { text: p.text, halo: ground },
    label_state: hidden,
    water_name_point_label: { text: mix(p.hard, p.text, 0.35), halo: water },
    water_name_line_label: hidden,
    waterway_line_label: hidden,
  };
}

/**
 * The still card's look: the same map with the place names taken off, since
 * the card sets your city's name in the middle itself (and a second, smaller
 * one from the map would sit just beside it).
 */
export function cardLook(look: Look): Look {
  const hidden = { hide: true };
  return { ...look, label_city: hidden, label_city_capital: hidden, label_town: hidden, label_village: hidden, label_other: hidden };
}

/**
 * The court card's little map in a chat: the same map with every name taken
 * off. A street name in a picture that small is mostly cut off at its edges,
 * and the court's badge in the middle is the thing to read.
 */
export function thumbLook(look: Look): Look {
  const hidden = { hide: true };
  return { ...cardLook(look), 'highway-name-major': hidden, 'highway-name-minor': hidden, 'highway-name-path': hidden, water_name_point_label: hidden };
}

/** Recolours the loaded style layer by layer; anything the style lacks is skipped. */
export function applyLook(map: LookMap, look: Look) {
  for (const [id, rule] of Object.entries(look)) {
    if (!map.getLayer(id)) continue;
    try {
      if (rule.hide) { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (rule.minZoom !== undefined) map.setLayerZoomRange(id, rule.minZoom, 24);
      if (rule.fill) map.setPaintProperty(id, id === 'background' ? 'background-color' : 'fill-color', rule.fill);
      // Shapes are flat fills: an outline in the style's own colour drew every building twice on a dark map.
      if (rule.fill && id !== 'background') map.setPaintProperty(id, 'fill-outline-color', rule.fill);
      if (rule.line) map.setPaintProperty(id, 'line-color', rule.line);
      if (rule.opacity !== undefined) map.setPaintProperty(id, 'line-opacity', rule.opacity);
      if (rule.text) map.setPaintProperty(id, 'text-color', rule.text);
      if (rule.halo) map.setPaintProperty(id, 'text-halo-color', rule.halo);
    } catch {
      // A layer that turned out to be a different type than expected: leave it.
    }
  }
}

