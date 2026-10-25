/** OpenStreetMap's page on its licence and how to credit it: where every map credit's words lead. */
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/**
 * Who the map's data comes from. Both licences ask to be credited where the
 * data shows: the map's ⓘ card and the About page read this one list (the
 * small maps' ⓘ, MapCreditDot, names OpenStreetMap alone: they show no weather).
 */
export const MAP_CREDITS = [
  { label: 'Map data © OpenStreetMap contributors', url: OSM_COPYRIGHT },
  { label: 'Weather by Open-Meteo.com', url: 'https://open-meteo.com/' },
] as const;
