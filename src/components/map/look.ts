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

export type Look = Record<string, { fill?: string; line?: string; text?: string; halo?: string; hide?: boolean; /** Only from this zoom in — small roads appear once you are close. */ minZoom?: number }>;

/** The handful of palette colours the map is mixed from. */
export interface MapPalette { bg: string; surface: string; text: string; textMuted: string; brand: string; court: string; hard: string; clay: string }

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const isDark = (c: string) => { const [r, g, b] = hex(c); return (r * 299 + g * 587 + b * 114) / 1000 < 128; };
/** `t` of the way from `a` to `b`. */
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a); const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/*
 * Snap Map, in the app's own colours: the ground is the theme's page, the
 * parks are its court green, the water its hard-court blue, the roads a
 * whisper lighter than the ground (small ones only when you are close).
 * No buildings, no road names, no shields, no motorway yellow — just
 * neighbourhoods and towns, so it reads as a place, not a street atlas.
 */
export function lookFor(p: MapPalette): Look {
  const dark = isDark(p.bg);
  const ground = p.bg;
  const built = mix(p.bg, p.surface, 0.6);
  const park = mix(ground, p.court, dark ? 0.22 : 0.2);
  const wood = mix(ground, p.court, dark ? 0.28 : 0.26);
  const grass = mix(ground, p.court, dark ? 0.14 : 0.12);
  const water = mix(ground, p.hard, dark ? 0.38 : 0.36);
  const road = dark ? mix(ground, p.text, 0.16) : '#FFFFFF';
  const big = dark ? mix(ground, p.text, 0.24) : mix('#FFFFFF', p.clay, 0.12);
  const tunnel = mix(ground, road, 0.5);
  const hidden = { hide: true };
  return {
    background: { fill: ground },
    // Detail arrives as you come closer: built-up patches and bigger roads
    // from a town's distance, small roads and village names only up close.
    landuse_residential: { fill: built, minZoom: 12 },
    park: { fill: park },
    landcover_wood: { fill: wood },
    landcover_grass: { fill: grass },
    water: { fill: water },
    waterway: { line: water },
    building: hidden,
    highway_path: hidden,
    highway_minor: { line: road, minZoom: 14 },
    highway_major_casing: hidden,
    highway_major_inner: { line: road, minZoom: 11.5 },
    highway_major_subtle: { line: road, minZoom: 11.5 },
    highway_motorway_casing: hidden,
    highway_motorway_inner: { line: big },
    highway_motorway_subtle: { line: big },
    highway_motorway_bridge_casing: hidden,
    highway_motorway_bridge_inner: { line: big },
    tunnel_motorway_casing: hidden,
    tunnel_motorway_inner: { line: tunnel },
    railway: hidden, railway_transit: hidden, railway_service: hidden,
    railway_dashline: hidden, railway_transit_dashline: hidden, railway_service_dashline: hidden,
    boundary_2: hidden, boundary_3: hidden,
    'highway-name-path': hidden, 'highway-name-minor': hidden, 'highway-name-major': hidden,
    'highway-shield-non-us': hidden, 'highway-shield-us-interstate': hidden, road_shield_us: hidden,
    airport: hidden,
    label_other: hidden,
    label_village: { text: p.textMuted, halo: ground, minZoom: 13 },
    label_town: { text: p.textMuted, halo: ground, minZoom: 11 },
    label_city: { text: p.text, halo: ground },
    label_city_capital: { text: p.text, halo: ground },
    label_state: hidden,
    water_name_point_label: { text: mix(p.hard, p.text, 0.3), halo: water },
    water_name_line_label: hidden,
    waterway_line_label: hidden,
  };
}

/** Recolours the loaded style layer by layer; anything the style lacks is skipped. */
export function applyLook(map: LookMap, look: Look) {
  for (const [id, rule] of Object.entries(look)) {
    if (!map.getLayer(id)) continue;
    try {
      if (rule.hide) { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (rule.minZoom !== undefined) map.setLayerZoomRange(id, rule.minZoom, 24);
      if (rule.fill) map.setPaintProperty(id, id === 'background' ? 'background-color' : 'fill-color', rule.fill);
      if (rule.line) map.setPaintProperty(id, 'line-color', rule.line);
      if (rule.text) map.setPaintProperty(id, 'text-color', rule.text);
      if (rule.halo) map.setPaintProperty(id, 'text-halo-color', rule.halo);
    } catch {
      // A layer that turned out to be a different type than expected: leave it.
    }
  }
}

