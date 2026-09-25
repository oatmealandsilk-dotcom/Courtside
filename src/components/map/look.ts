/**
 * The map's look, shared by the browser canvas (MapLibre in the page) and
 * the phone canvas (the same MapLibre inside a web view): OpenFreeMap's
 * plainest style, recoloured into warm paper by day and a quiet dark by
 * night, with only the labels that matter.
 */
/** The few MapLibre calls the recolouring needs, so this file has no MapLibre import of its own. */
export interface LookMap {
  getLayer(id: string): unknown;
  setLayoutProperty(id: string, name: string, value: unknown): unknown;
  setPaintProperty(id: string, name: string, value: unknown): unknown;
}

/**
 * The plainest vector style OpenFreeMap offers (free, no key), recoloured
 * below into the soft, quiet look of Apple Maps: warm paper, white roads,
 * pale water and parks, and only the labels that matter.
 */
export const STYLE = 'https://tiles.openfreemap.org/styles/positron';

export type Look = Record<string, { fill?: string; line?: string; text?: string; halo?: string; hide?: boolean }>;
export const DAY: Look = {
  background: { fill: '#F6F4EF' },
  landuse_residential: { fill: '#F1EFE9' },
  park: { fill: '#D7E9CB' },
  landcover_wood: { fill: '#D2E3C5' },
  water: { fill: '#B7D6EC' },
  waterway: { line: '#B7D6EC' },
  building: { fill: '#EAE7E0' },
  highway_path: { line: '#E6E2DA' },
  highway_minor: { line: '#FFFFFF' },
  highway_major_casing: { line: '#E3DFD6' },
  highway_major_inner: { line: '#FFFFFF' },
  highway_major_subtle: { line: '#FFFFFF' },
  highway_motorway_casing: { line: '#E8D9A0' },
  highway_motorway_inner: { line: '#FBEFC1' },
  highway_motorway_subtle: { line: '#FBEFC1' },
  highway_motorway_bridge_casing: { line: '#E8D9A0' },
  highway_motorway_bridge_inner: { line: '#FBEFC1' },
  tunnel_motorway_casing: { line: '#EEE6CC' },
  tunnel_motorway_inner: { line: '#F8F1D8' },
  railway: { line: '#E0DCD3' }, railway_transit: { line: '#E0DCD3' }, railway_service: { line: '#E0DCD3' },
  railway_dashline: { hide: true }, railway_transit_dashline: { hide: true }, railway_service_dashline: { hide: true },
  boundary_2: { line: '#CFCAC0' }, boundary_3: { line: '#D9D4CB' },
  'highway-name-path': { hide: true },
  'highway-name-minor': { text: '#8E8A80', halo: '#FFFFFF' },
  'highway-name-major': { text: '#6F6B62', halo: '#FFFFFF' },
  'highway-shield-non-us': { hide: true }, 'highway-shield-us-interstate': { hide: true }, road_shield_us: { hide: true },
  airport: { text: '#8E8A80', halo: '#F6F4EF' },
  label_other: { text: '#8E8A80', halo: '#F6F4EF' },
  label_village: { text: '#6F6B62', halo: '#F6F4EF' },
  label_town: { text: '#5C584F', halo: '#F6F4EF' },
  label_city: { text: '#3A372F', halo: '#F6F4EF' },
  label_city_capital: { text: '#3A372F', halo: '#F6F4EF' },
  label_state: { text: '#9A968C', halo: '#F6F4EF' },
  water_name_point_label: { text: '#6A94B5', halo: '#B7D6EC' },
  water_name_line_label: { text: '#6A94B5', halo: '#B7D6EC' },
  waterway_line_label: { text: '#6A94B5', halo: '#B7D6EC' },
};
export const NIGHT: Look = {
  background: { fill: '#1C1C1E' },
  landuse_residential: { fill: '#222224' },
  park: { fill: '#1F2A21' },
  landcover_wood: { fill: '#1D271F' },
  water: { fill: '#152232' },
  waterway: { line: '#152232' },
  building: { fill: '#262628' },
  highway_path: { line: '#2C2C2E' },
  highway_minor: { line: '#333335' },
  highway_major_casing: { line: '#2A2A2C' },
  highway_major_inner: { line: '#3F3F42' },
  highway_major_subtle: { line: '#3F3F42' },
  highway_motorway_casing: { line: '#3A3620' },
  highway_motorway_inner: { line: '#5A5230' },
  highway_motorway_subtle: { line: '#5A5230' },
  highway_motorway_bridge_casing: { line: '#3A3620' },
  highway_motorway_bridge_inner: { line: '#5A5230' },
  tunnel_motorway_casing: { line: '#2E2C22' },
  tunnel_motorway_inner: { line: '#403C2A' },
  railway: { line: '#2E2E30' }, railway_transit: { line: '#2E2E30' }, railway_service: { line: '#2E2E30' },
  railway_dashline: { hide: true }, railway_transit_dashline: { hide: true }, railway_service_dashline: { hide: true },
  boundary_2: { line: '#3A3A3C' }, boundary_3: { line: '#333335' },
  'highway-name-path': { hide: true },
  'highway-name-minor': { text: '#8E8E93', halo: '#1C1C1E' },
  'highway-name-major': { text: '#AEAEB2', halo: '#1C1C1E' },
  'highway-shield-non-us': { hide: true }, 'highway-shield-us-interstate': { hide: true }, road_shield_us: { hide: true },
  airport: { text: '#8E8E93', halo: '#1C1C1E' },
  label_other: { text: '#8E8E93', halo: '#1C1C1E' },
  label_village: { text: '#AEAEB2', halo: '#1C1C1E' },
  label_town: { text: '#C7C7CC', halo: '#1C1C1E' },
  label_city: { text: '#E5E5EA', halo: '#1C1C1E' },
  label_city_capital: { text: '#E5E5EA', halo: '#1C1C1E' },
  label_state: { text: '#8E8E93', halo: '#1C1C1E' },
  water_name_point_label: { text: '#6B8FB0', halo: '#152232' },
  water_name_line_label: { text: '#6B8FB0', halo: '#152232' },
  waterway_line_label: { text: '#6B8FB0', halo: '#152232' },
};

/** Recolours the loaded style layer by layer; anything the style lacks is skipped. */
export function applyLook(map: LookMap, look: Look) {
  for (const [id, rule] of Object.entries(look)) {
    if (!map.getLayer(id)) continue;
    try {
      if (rule.hide) { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (rule.fill) map.setPaintProperty(id, id === 'background' ? 'background-color' : 'fill-color', rule.fill);
      if (rule.line) map.setPaintProperty(id, 'line-color', rule.line);
      if (rule.text) map.setPaintProperty(id, 'text-color', rule.text);
      if (rule.halo) map.setPaintProperty(id, 'text-halo-color', rule.halo);
    } catch {
      // A layer that turned out to be a different type than expected: leave it.
    }
  }
}

