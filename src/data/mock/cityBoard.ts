/**
 * City boards (migration 196): the demo build's made-up month, moved here
 * from the approved design mock (design/city-board, Oct 27-28) unchanged,
 * so api.ts can hand the screens exactly what city_board() and city_page()
 * send. No real player's data is in here; the numbers are made up.
 *
 * The cities are the server's own board ids (board_cities): the demo's
 * players in Pasadena, Glendale and Burbank count for Los Angeles, the way
 * the server folds a suburb into its metro.
 */

/** One city's month, as the refresh job would have it (as of yesterday), without the demo player's own sessions. */
export interface DemoBoardCity {
  id: string;
  name: string;
  region: string;
  sessions: number;
  players: number;
  /** Its place a week ago on the sessions board (0: new to it). */
  weekAgoRank: number;
  /** Weeks in a row it has climbed. */
  run?: number;
}

/** October's board, made up. A young app's numbers: hundreds, not thousands. */
export const DEMO_BOARD_CITIES: DemoBoardCity[] = [
  { id: 'new-york-ny', name: 'New York', region: 'NY', sessions: 512, players: 88, weekAgoRank: 1 },
  { id: 'austin-tx', name: 'Austin', region: 'TX', sessions: 473, players: 54, weekAgoRank: 3, run: 1 },
  { id: 'los-angeles-ca', name: 'Los Angeles', region: 'CA', sessions: 404, players: 70, weekAgoRank: 2 },
  { id: 'chicago-il', name: 'Chicago', region: 'IL', sessions: 288, players: 47, weekAgoRank: 7, run: 2 },
  { id: 'miami-fl', name: 'Miami', region: 'FL', sessions: 241, players: 35, weekAgoRank: 6, run: 1 },
  { id: 'seattle-wa', name: 'Seattle', region: 'WA', sessions: 197, players: 33, weekAgoRank: 4 },
  { id: 'denver-co', name: 'Denver', region: 'CO', sessions: 164, players: 21, weekAgoRank: 5 },
  { id: 'raleigh-nc', name: 'Raleigh', region: 'NC', sessions: 96, players: 9, weekAgoRank: 11, run: 3 },
  { id: 'atlanta-ga', name: 'Atlanta', region: 'GA', sessions: 88, players: 15, weekAgoRank: 8 },
  { id: 'san-diego-ca', name: 'San Diego', region: 'CA', sessions: 71, players: 13, weekAgoRank: 9 },
  { id: 'boston-ma', name: 'Boston', region: 'MA', sessions: 64, players: 12, weekAgoRank: 10 },
  { id: 'houston-tx', name: 'Houston', region: 'TX', sessions: 52, players: 10, weekAgoRank: 12 },
  { id: 'phoenix-az', name: 'Phoenix', region: 'AZ', sessions: 41, players: 8, weekAgoRank: 14, run: 1 },
  { id: 'nashville-tn', name: 'Nashville', region: 'TN', sessions: 37, players: 6, weekAgoRank: 13 },
  { id: 'portland-or', name: 'Portland', region: 'OR', sessions: 33, players: 7, weekAgoRank: 15 },
  // Too few players to rank yet: never shown to anyone outside it.
  { id: 'durham-nc', name: 'Durham–Chapel Hill', region: 'NC', sessions: 14, players: 3, weekAgoRank: 0 },
];

/** The demo's towns, "town|ST" in lower case → the board city they count for (the server's board_city_places). */
export const DEMO_BOARD_PLACES: Record<string, string> = {
  'los angeles|ca': 'los-angeles-ca', 'pasadena|ca': 'los-angeles-ca', 'glendale|ca': 'los-angeles-ca', 'burbank|ca': 'los-angeles-ca', 'santa monica|ca': 'los-angeles-ca',
  'new york|ny': 'new-york-ny', 'brooklyn|ny': 'new-york-ny', 'austin|tx': 'austin-tx', 'chicago|il': 'chicago-il', 'miami|fl': 'miami-fl',
  'seattle|wa': 'seattle-wa', 'denver|co': 'denver-co', 'raleigh|nc': 'raleigh-nc', 'cary|nc': 'raleigh-nc', 'durham|nc': 'durham-nc',
  'atlanta|ga': 'atlanta-ga', 'san diego|ca': 'san-diego-ca', 'boston|ma': 'boston-ma', 'houston|tx': 'houston-tx', 'phoenix|az': 'phoenix-az',
  'nashville|tn': 'nashville-tn', 'portland|or': 'portland-or',
};

/** The week's moments on the board (made up), as how many days ago each happened: "Raleigh passed Atlanta · today". */
export const DEMO_BOARD_EVENTS: { who: string; passed: string; daysAgo: number }[] = [
  { who: 'raleigh-nc', passed: 'atlanta-ga', daysAgo: 0 },
  { who: 'austin-tx', passed: 'los-angeles-ca', daysAgo: 1 },
  { who: 'chicago-il', passed: 'seattle-wa', daysAgo: 3 },
];

/** This month's counted sessions for the demo's own players (made up), by the demo user's id. */
export const DEMO_PLAYER_SESSIONS: Record<string, number> = {
  'u-sam': 23, 'u-marcus': 21, 'u-noor': 19, 'u-theo': 17, 'u-lena': 16, 'u-omar': 14,
  'u-bea': 12, 'u-jonah': 11, 'u-ivy': 9, 'u-diego': 8, 'u-ella': 22, 'u-priya': 6, 'u-rosa': 5, 'u-kai': 4,
  // Austin
  'u-mira': 26, 'u-leo': 24,
  // Others
  'u-dev': 18, 'u-june': 15, 'u-tomas': 13, 'u-nadia': 20,
};

/**
 * A player's latest logged sessions (made up), newest first, each as when it
 * started: [weekday (0 Sunday … 6 Saturday), hour (0-23)]; and how many days
 * ago the newest was. Only what the session log already holds: no place, no
 * court, no live location. The demo works out the habit from it by the
 * server's own rule (refresh_city_board, step 2).
 */
export interface DemoPlayLog { sessions: [number, number][]; lastDaysAgo: number }

export const DEMO_PLAY_LOG: Record<string, DemoPlayLog> = {
  // Los Angeles
  'u-sam': { sessions: [[6, 9], [0, 10], [3, 18], [6, 8], [0, 9], [6, 16], [2, 19], [0, 11], [6, 9], [0, 15]], lastDaysAgo: 2 },
  'u-marcus': { sessions: [[1, 19], [2, 18], [3, 19], [4, 20], [1, 18], [3, 18], [6, 10], [2, 19], [4, 18], [0, 9]], lastDaysAgo: 1 },
  'u-noor': { sessions: [[6, 9], [0, 10], [6, 8], [0, 9], [6, 16], [3, 18], [0, 11], [6, 9], [0, 8], [5, 19]], lastDaysAgo: 2 },
  'u-theo': { sessions: [[1, 7], [2, 6], [3, 7], [5, 7], [1, 6], [4, 7], [2, 7], [6, 8], [3, 6], [5, 18]], lastDaysAgo: 0 },
  // No clear habit and not in the last week: her number when she is on Top players, else "Active this month".
  'u-lena': { sessions: [[2, 12], [6, 15], [4, 19], [0, 9], [3, 13], [1, 18], [5, 10], [6, 17]], lastDaysAgo: 9 },
  // No clear habit, not in the last week, and not on Top players: "Active this month", never a number.
  'u-omar': { sessions: [[2, 12], [4, 18], [6, 9], [3, 14], [0, 16], [5, 19], [1, 13], [6, 15]], lastDaysAgo: 8 },
  'u-bea': { sessions: [[6, 10], [0, 15], [6, 9], [0, 16], [6, 11], [3, 19]], lastDaysAgo: 2 },
  'u-jonah': { sessions: [[2, 12], [5, 18], [6, 10], [3, 13], [1, 7]], lastDaysAgo: 3 },
  'u-ivy': { sessions: [[4, 18], [6, 10], [2, 7]], lastDaysAgo: 5 },
  'u-diego': { sessions: [[1, 19], [3, 20], [4, 18], [2, 19], [0, 10]], lastDaysAgo: 1 },
  // Austin
  'u-mira': { sessions: [[6, 8], [0, 9], [6, 9], [0, 8], [6, 10], [2, 18]], lastDaysAgo: 2 },
};

/**
 * Most active courts this month (made up): visits, one player one day at the
 * court, from sessions, open hits and "I'm playing here"; only courts 3+
 * different players used count (city_page().active_courts, migration 198).
 * Their spots are where the courts really are, so a tap opens the court's page.
 * A city not listed here (Chicago, say) shows the section's empty line.
 */
export const DEMO_ACTIVE_COURTS: Record<string, { name: string; visits: number; lat: number; lng: number }[]> = {
  'new-york-ny': [
    { name: 'Central Park Tennis Center', visits: 84, lat: 40.78962, lng: -73.96166 },
    { name: 'McCarren Park', visits: 57, lat: 40.72068, lng: -73.95154 },
    { name: 'Riverside Park Clay Courts', visits: 41, lat: 40.79571, lng: -73.97441 },
    { name: 'Hudson River Park Pier 40', visits: 26, lat: 40.72963, lng: -74.01126 },
    { name: 'Prospect Park Tennis Center', visits: 18, lat: 40.65306, lng: -73.97389 },
  ],
  'los-angeles-ca': [
    { name: 'Alder Park', visits: 64, lat: 34.0907, lng: -118.3064 },
    { name: 'Cypress Hollow Park', visits: 51, lat: 34.0632, lng: -118.3441 },
    { name: 'Juniper Community Park', visits: 29, lat: 34.1162, lng: -118.2701 },
  ],
  'austin-tx': [
    { name: 'Austin High Tennis Center', visits: 72, lat: 30.27397, lng: -97.76751 },
    { name: 'Pharr Tennis Center', visits: 58, lat: 30.30891, lng: -97.71547 },
    { name: 'Caswell Tennis Center', visits: 41, lat: 30.28768, lng: -97.75249 },
  ],
  'raleigh-nc': [
    { name: 'Millbrook Exchange Park', visits: 31, lat: 35.86764, lng: -78.61531 },
    { name: 'Pullen Park', visits: 22, lat: 35.77874, lng: -78.66273 },
    { name: 'Lions Park', visits: 14, lat: 35.79201, lng: -78.61501 },
  ],
};

/**
 * The month's most watched clip in each city (made up): the top candidates,
 * best first, as the refresh job keeps them (city_board_clips), so a viewer
 * who blocked the first still gets the next. Only a public clip by an adult.
 */
// The server picks only a clip with no court and no place on it (city_board_clip_ok: a clip is already a
// person and a time); the demo keeps only clips that carry a court, so its Los Angeles clip stands in for one,
// and Austin's (not among the clips the demo shows) leaves Austin's page without a clip, as a city with none.
export const DEMO_CITY_CLIPS: Record<string, { postId: string; authorId: string; views: number }[]> = {
  'los-angeles-ca': [{ postId: 'p-sam-clip', authorId: 'u-sam', views: 2431 }],
  'austin-tx': [{ postId: 'p1', authorId: 'u-mira', views: 1874 }],
};
