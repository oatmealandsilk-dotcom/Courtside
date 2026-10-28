import { milesBetween } from '@/features/players/geo';

/**
 * Every city a board can ever show (owner, Oct 28: "Also add the other
 * cities on the list. You can just put them at 0"): the server's own
 * board_cities (migration 196), the same 214 US metro areas, each with the
 * map spot of its main city (its first board_city_places row). Checked
 * against the live database on Oct 28: the same ids, names and states.
 *
 * Why the phone carries its own copy: the app cannot read board_cities (196
 * keeps every board table closed), and city_board() sends ranked cities
 * only. So the cities at 0 come from here, never from the server: the
 * server says nothing about a city with no row on the board, and the phone
 * learns nothing about it. A city with sessions but fewer than 5 players
 * (MIN_PLAYERS) is not ranked, so it is not sent, so it shows here exactly
 * as a city where nobody has played: "–", 0, in the same order.
 *
 * Their order is never by activity: nearest first to the city on your
 * profile (from these fixed spots), else by name. A city added to
 * board_cities later and ranked still shows (the server sends its row);
 * add it here too so it shows at 0 before then.
 */

/** [board id, name, state, lat, lng], as migration 196 inserts them. */
type Row = [id: string, name: string, region: string, lat: number, lng: number];

const ROWS: Row[] = [
  ['new-york-ny', 'New York', 'NY', 40.71, -74.01],
  ['los-angeles-ca', 'Los Angeles', 'CA', 34.05, -118.24],
  ['chicago-il', 'Chicago', 'IL', 41.88, -87.63],
  ['dallas-tx', 'Dallas–Fort Worth', 'TX', 32.78, -96.8],
  ['houston-tx', 'Houston', 'TX', 29.76, -95.37],
  ['washington-dc', 'Washington', 'DC', 38.91, -77.04],
  ['philadelphia-pa', 'Philadelphia', 'PA', 39.95, -75.17],
  ['miami-fl', 'Miami', 'FL', 25.76, -80.19],
  ['atlanta-ga', 'Atlanta', 'GA', 33.75, -84.39],
  ['boston-ma', 'Boston', 'MA', 42.36, -71.06],
  ['phoenix-az', 'Phoenix', 'AZ', 33.45, -112.07],
  ['san-francisco-ca', 'San Francisco', 'CA', 37.77, -122.42],
  ['riverside-ca', 'Riverside', 'CA', 33.95, -117.4],
  ['detroit-mi', 'Detroit', 'MI', 42.33, -83.05],
  ['seattle-wa', 'Seattle', 'WA', 47.61, -122.33],
  ['minneapolis-mn', 'Minneapolis–St. Paul', 'MN', 44.98, -93.27],
  ['san-diego-ca', 'San Diego', 'CA', 32.72, -117.16],
  ['tampa-fl', 'Tampa', 'FL', 27.95, -82.46],
  ['denver-co', 'Denver', 'CO', 39.74, -104.99],
  ['baltimore-md', 'Baltimore', 'MD', 39.29, -76.61],
  ['st-louis-mo', 'St. Louis', 'MO', 38.63, -90.2],
  ['orlando-fl', 'Orlando', 'FL', 28.54, -81.38],
  ['charlotte-nc', 'Charlotte', 'NC', 35.23, -80.84],
  ['san-antonio-tx', 'San Antonio', 'TX', 29.42, -98.49],
  ['portland-or', 'Portland', 'OR', 45.52, -122.68],
  ['sacramento-ca', 'Sacramento', 'CA', 38.58, -121.49],
  ['pittsburgh-pa', 'Pittsburgh', 'PA', 40.44, -79.99],
  ['austin-tx', 'Austin', 'TX', 30.27, -97.74],
  ['las-vegas-nv', 'Las Vegas', 'NV', 36.17, -115.14],
  ['cincinnati-oh', 'Cincinnati', 'OH', 39.1, -84.51],
  ['kansas-city-mo', 'Kansas City', 'MO', 39.1, -94.58],
  ['columbus-oh', 'Columbus', 'OH', 39.96, -83],
  ['indianapolis-in', 'Indianapolis', 'IN', 39.77, -86.16],
  ['cleveland-oh', 'Cleveland', 'OH', 41.5, -81.69],
  ['san-jose-ca', 'San Jose', 'CA', 37.34, -121.89],
  ['nashville-tn', 'Nashville', 'TN', 36.16, -86.78],
  ['virginia-beach-va', 'Virginia Beach', 'VA', 36.85, -75.98],
  ['providence-ri', 'Providence', 'RI', 41.82, -71.41],
  ['jacksonville-fl', 'Jacksonville', 'FL', 30.33, -81.66],
  ['milwaukee-wi', 'Milwaukee', 'WI', 43.04, -87.91],
  ['raleigh-nc', 'Raleigh', 'NC', 35.78, -78.64],
  ['oklahoma-city-ok', 'Oklahoma City', 'OK', 35.47, -97.52],
  ['memphis-tn', 'Memphis', 'TN', 35.15, -90.05],
  ['richmond-va', 'Richmond', 'VA', 37.54, -77.44],
  ['louisville-ky', 'Louisville', 'KY', 38.25, -85.76],
  ['new-orleans-la', 'New Orleans', 'LA', 29.95, -90.07],
  ['salt-lake-city-ut', 'Salt Lake City', 'UT', 40.76, -111.89],
  ['hartford-ct', 'Hartford', 'CT', 41.76, -72.67],
  ['buffalo-ny', 'Buffalo', 'NY', 42.89, -78.88],
  ['birmingham-al', 'Birmingham', 'AL', 33.52, -86.8],
  ['rochester-ny', 'Rochester', 'NY', 43.16, -77.61],
  ['grand-rapids-mi', 'Grand Rapids', 'MI', 42.96, -85.67],
  ['tucson-az', 'Tucson', 'AZ', 32.22, -110.97],
  ['honolulu-hi', 'Honolulu', 'HI', 21.31, -157.86],
  ['tulsa-ok', 'Tulsa', 'OK', 36.15, -95.99],
  ['fresno-ca', 'Fresno', 'CA', 36.74, -119.79],
  ['worcester-ma', 'Worcester', 'MA', 42.26, -71.8],
  ['omaha-ne', 'Omaha', 'NE', 41.26, -95.93],
  ['bridgeport-ct', 'Bridgeport–Stamford', 'CT', 41.19, -73.2],
  ['greenville-sc', 'Greenville', 'SC', 34.85, -82.4],
  ['albuquerque-nm', 'Albuquerque', 'NM', 35.08, -106.65],
  ['bakersfield-ca', 'Bakersfield', 'CA', 35.37, -119.02],
  ['albany-ny', 'Albany', 'NY', 42.65, -73.76],
  ['knoxville-tn', 'Knoxville', 'TN', 35.96, -83.92],
  ['el-paso-tx', 'El Paso', 'TX', 31.76, -106.49],
  ['baton-rouge-la', 'Baton Rouge', 'LA', 30.45, -91.15],
  ['mcallen-tx', 'McAllen', 'TX', 26.2, -98.23],
  ['new-haven-ct', 'New Haven', 'CT', 41.31, -72.92],
  ['allentown-pa', 'Allentown', 'PA', 40.6, -75.49],
  ['oxnard-ca', 'Oxnard–Ventura', 'CA', 34.2, -119.18],
  ['columbia-sc', 'Columbia', 'SC', 34, -81.03],
  ['sarasota-fl', 'Sarasota', 'FL', 27.34, -82.53],
  ['dayton-oh', 'Dayton', 'OH', 39.76, -84.19],
  ['charleston-sc', 'Charleston', 'SC', 32.78, -79.93],
  ['greensboro-nc', 'Greensboro', 'NC', 36.07, -79.79],
  ['stockton-ca', 'Stockton', 'CA', 37.96, -121.29],
  ['cape-coral-fl', 'Cape Coral–Fort Myers', 'FL', 26.56, -81.95],
  ['boise-id', 'Boise', 'ID', 43.62, -116.2],
  ['colorado-springs-co', 'Colorado Springs', 'CO', 38.83, -104.82],
  ['little-rock-ar', 'Little Rock', 'AR', 34.75, -92.29],
  ['lakeland-fl', 'Lakeland', 'FL', 28.04, -81.95],
  ['akron-oh', 'Akron', 'OH', 41.08, -81.52],
  ['des-moines-ia', 'Des Moines', 'IA', 41.59, -93.62],
  ['springfield-ma', 'Springfield', 'MA', 42.1, -72.59],
  ['ogden-ut', 'Ogden', 'UT', 41.22, -111.97],
  ['madison-wi', 'Madison', 'WI', 43.07, -89.4],
  ['winston-salem-nc', 'Winston-Salem', 'NC', 36.1, -80.24],
  ['daytona-beach-fl', 'Daytona Beach', 'FL', 29.21, -81.02],
  ['syracuse-ny', 'Syracuse', 'NY', 43.05, -76.15],
  ['provo-ut', 'Provo', 'UT', 40.23, -111.66],
  ['toledo-oh', 'Toledo', 'OH', 41.65, -83.54],
  ['wichita-ks', 'Wichita', 'KS', 37.69, -97.34],
  ['durham-nc', 'Durham–Chapel Hill', 'NC', 35.99, -78.9],
  ['augusta-ga', 'Augusta', 'GA', 33.47, -81.97],
  ['palm-bay-fl', 'Palm Bay–Melbourne', 'FL', 28.03, -80.59],
  ['jackson-ms', 'Jackson', 'MS', 32.3, -90.18],
  ['harrisburg-pa', 'Harrisburg', 'PA', 40.27, -76.88],
  ['spokane-wa', 'Spokane', 'WA', 47.66, -117.43],
  ['scranton-pa', 'Scranton', 'PA', 41.41, -75.66],
  ['chattanooga-tn', 'Chattanooga', 'TN', 35.05, -85.31],
  ['lancaster-pa', 'Lancaster', 'PA', 40.04, -76.31],
  ['modesto-ca', 'Modesto', 'CA', 37.64, -121],
  ['portland-me', 'Portland', 'ME', 43.66, -70.26],
  ['fayetteville-ar', 'Fayetteville', 'AR', 36.06, -94.16],
  ['lexington-ky', 'Lexington', 'KY', 38.04, -84.5],
  ['fayetteville-nc', 'Fayetteville', 'NC', 35.05, -78.88],
  ['pensacola-fl', 'Pensacola', 'FL', 30.42, -87.22],
  ['lansing-mi', 'Lansing', 'MI', 42.73, -84.56],
  ['huntsville-al', 'Huntsville', 'AL', 34.73, -86.59],
  ['santa-rosa-ca', 'Santa Rosa', 'CA', 38.44, -122.71],
  ['myrtle-beach-sc', 'Myrtle Beach', 'SC', 33.69, -78.89],
  ['port-st-lucie-fl', 'Port St. Lucie', 'FL', 27.27, -80.35],
  ['reno-nv', 'Reno', 'NV', 39.53, -119.81],
  ['asheville-nc', 'Asheville', 'NC', 35.6, -82.55],
  ['ann-arbor-mi', 'Ann Arbor', 'MI', 42.28, -83.74],
  ['wilmington-nc', 'Wilmington', 'NC', 34.23, -77.94],
  ['savannah-ga', 'Savannah', 'GA', 32.08, -81.09],
  ['naples-fl', 'Naples', 'FL', 26.14, -81.79],
  ['tallahassee-fl', 'Tallahassee', 'FL', 30.44, -84.28],
  ['corpus-christi-tx', 'Corpus Christi', 'TX', 27.8, -97.4],
  ['anchorage-ak', 'Anchorage', 'AK', 61.22, -149.9],
  ['fort-wayne-in', 'Fort Wayne', 'IN', 41.08, -85.14],
  ['boulder-co', 'Boulder', 'CO', 40.01, -105.27],
  ['gainesville-fl', 'Gainesville', 'FL', 29.65, -82.32],
  ['santa-barbara-ca', 'Santa Barbara', 'CA', 34.42, -119.7],
  ['hilton-head-sc', 'Hilton Head', 'SC', 32.22, -80.75],
  ['tyler-tx', 'Tyler', 'TX', 32.35, -95.3],
  ['athens-ga', 'Athens', 'GA', 33.96, -83.38],
  ['charlottesville-va', 'Charlottesville', 'VA', 38.03, -78.48],
  ['montgomery-al', 'Montgomery', 'AL', 32.38, -86.3],
  ['manchester-nh', 'Manchester', 'NH', 42.99, -71.46],
  ['burlington-vt', 'Burlington', 'VT', 44.48, -73.21],
  ['charleston-wv', 'Charleston', 'WV', 38.35, -81.63],
  ['lincoln-ne', 'Lincoln', 'NE', 40.81, -96.7],
  ['sioux-falls-sd', 'Sioux Falls', 'SD', 43.54, -96.73],
  ['fargo-nd', 'Fargo', 'ND', 46.88, -96.79],
  ['billings-mt', 'Billings', 'MT', 45.78, -108.5],
  ['springfield-mo', 'Springfield', 'MO', 37.21, -93.29],
  ['columbia-mo', 'Columbia', 'MO', 38.95, -92.33],
  ['peoria-il', 'Peoria', 'IL', 40.69, -89.59],
  ['champaign-il', 'Champaign', 'IL', 40.12, -88.24],
  ['bloomington-in', 'Bloomington', 'IN', 39.17, -86.53],
  ['south-bend-in', 'South Bend', 'IN', 41.68, -86.25],
  ['evansville-in', 'Evansville', 'IN', 37.97, -87.57],
  ['kalamazoo-mi', 'Kalamazoo', 'MI', 42.29, -85.59],
  ['flint-mi', 'Flint', 'MI', 43.01, -83.69],
  ['rockford-il', 'Rockford', 'IL', 42.27, -89.09],
  ['green-bay-wi', 'Green Bay', 'WI', 44.51, -88.01],
  ['cedar-rapids-ia', 'Cedar Rapids', 'IA', 41.98, -91.67],
  ['davenport-ia', 'Davenport', 'IA', 41.52, -90.58],
  ['shreveport-la', 'Shreveport', 'LA', 32.53, -93.75],
  ['lafayette-la', 'Lafayette', 'LA', 30.22, -92.02],
  ['mobile-al', 'Mobile', 'AL', 30.69, -88.04],
  ['beaumont-tx', 'Beaumont', 'TX', 30.08, -94.1],
  ['killeen-tx', 'Killeen', 'TX', 31.12, -97.73],
  ['waco-tx', 'Waco', 'TX', 31.55, -97.15],
  ['lubbock-tx', 'Lubbock', 'TX', 33.58, -101.86],
  ['amarillo-tx', 'Amarillo', 'TX', 35.22, -101.83],
  ['brownsville-tx', 'Brownsville', 'TX', 25.9, -97.5],
  ['laredo-tx', 'Laredo', 'TX', 27.51, -99.51],
  ['college-station-tx', 'College Station', 'TX', 30.63, -96.33],
  ['midland-tx', 'Midland', 'TX', 32, -102.08],
  ['salem-or', 'Salem', 'OR', 44.94, -123.04],
  ['eugene-or', 'Eugene', 'OR', 44.05, -123.09],
  ['bend-or', 'Bend', 'OR', 44.06, -121.32],
  ['olympia-wa', 'Olympia', 'WA', 47.04, -122.9],
  ['kennewick-wa', 'Kennewick', 'WA', 46.21, -119.14],
  ['visalia-ca', 'Visalia', 'CA', 36.33, -119.29],
  ['salinas-ca', 'Salinas', 'CA', 36.68, -121.66],
  ['san-luis-obispo-ca', 'San Luis Obispo', 'CA', 35.28, -120.66],
  ['santa-cruz-ca', 'Santa Cruz', 'CA', 36.97, -122.03],
  ['redding-ca', 'Redding', 'CA', 40.59, -122.39],
  ['chico-ca', 'Chico', 'CA', 39.73, -121.84],
  ['yuma-az', 'Yuma', 'AZ', 32.69, -114.63],
  ['prescott-az', 'Prescott', 'AZ', 34.54, -112.47],
  ['flagstaff-az', 'Flagstaff', 'AZ', 35.2, -111.65],
  ['las-cruces-nm', 'Las Cruces', 'NM', 32.32, -106.76],
  ['santa-fe-nm', 'Santa Fe', 'NM', 35.69, -105.94],
  ['st-george-ut', 'St. George', 'UT', 37.1, -113.58],
  ['fort-collins-co', 'Fort Collins', 'CO', 40.59, -105.08],
  ['greeley-co', 'Greeley', 'CO', 40.42, -104.71],
  ['pueblo-co', 'Pueblo', 'CO', 38.25, -104.61],
  ['topeka-ks', 'Topeka', 'KS', 39.05, -95.68],
  ['lawrence-ks', 'Lawrence', 'KS', 38.97, -95.24],
  ['portsmouth-nh', 'Portsmouth', 'NH', 43.07, -70.76],
  ['trenton-nj', 'Trenton', 'NJ', 40.22, -74.76],
  ['atlantic-city-nj', 'Atlantic City', 'NJ', 39.36, -74.42],
  ['salisbury-md', 'Salisbury', 'MD', 38.37, -75.6],
  ['hagerstown-md', 'Hagerstown', 'MD', 39.64, -77.72],
  ['reading-pa', 'Reading', 'PA', 40.34, -75.93],
  ['york-pa', 'York', 'PA', 39.96, -76.73],
  ['state-college-pa', 'State College', 'PA', 40.79, -77.86],
  ['erie-pa', 'Erie', 'PA', 42.13, -80.09],
  ['utica-ny', 'Utica', 'NY', 43.1, -75.23],
  ['binghamton-ny', 'Binghamton', 'NY', 42.1, -75.91],
  ['ithaca-ny', 'Ithaca', 'NY', 42.44, -76.5],
  ['poughkeepsie-ny', 'Poughkeepsie', 'NY', 41.7, -73.92],
  ['kingsport-tn', 'Kingsport–Johnson City', 'TN', 36.55, -82.56],
  ['clarksville-tn', 'Clarksville', 'TN', 36.53, -87.36],
  ['roanoke-va', 'Roanoke', 'VA', 37.27, -79.94],
  ['lynchburg-va', 'Lynchburg', 'VA', 37.41, -79.14],
  ['greenville-nc', 'Greenville', 'NC', 35.61, -77.37],
  ['hickory-nc', 'Hickory', 'NC', 35.73, -81.34],
  ['spartanburg-sc', 'Spartanburg', 'SC', 34.95, -81.93],
  ['macon-ga', 'Macon', 'GA', 32.84, -83.63],
  ['columbus-ga', 'Columbus', 'GA', 32.46, -84.99],
  ['tuscaloosa-al', 'Tuscaloosa', 'AL', 33.21, -87.57],
  ['gulfport-ms', 'Gulfport', 'MS', 30.37, -89.09],
  ['ocala-fl', 'Ocala', 'FL', 29.19, -82.14],
  ['panama-city-fl', 'Panama City', 'FL', 30.16, -85.66],
  ['vero-beach-fl', 'Vero Beach', 'FL', 27.64, -80.4],
  ['punta-gorda-fl', 'Punta Gorda', 'FL', 26.93, -82.05],
  ['key-west-fl', 'Key West', 'FL', 24.56, -81.78],
  ['kahului-hi', 'Maui', 'HI', 20.89, -156.47],
];

/** A city with no row on this month's board, shown at 0. Everything here is from the fixed list above. */
export interface ZeroCity {
  id: string;
  name: string;
  region: string;
  /** Marks a row at 0 among ranked ones (a ranked row has a place instead). */
  zero: true;
}

const BY_ID = new Map(ROWS.map((r) => [r[0], r]));

/** Names two cities share (Portland OR and ME, Greenville NC and SC…): those rows carry their state. */
const SHARED = (() => {
  const seen = new Map<string, number>();
  for (const r of ROWS) seen.set(r[1], (seen.get(r[1]) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
})();

/** How a board row names a city: "Raleigh"; "Greenville, NC" where another city has the same name. */
export const cityLabel = (c: { name: string; region: string }) => (SHARED.has(c.name) ? `${c.name}, ${c.region}` : c.name);

/** One of the board's cities, by id ('greensboro-nc'), or null. */
export function catalogCity(id: string): ZeroCity | null {
  const r = BY_ID.get(id);
  return r ? { id: r[0], name: r[1], region: r[2], zero: true } : null;
}

/** Where a board city's "See … on the map" opens the map: the fixed, public spot of its main city, or null. */
export function catalogSpot(id: string): { lat: number; lng: number } | null {
  const r = BY_ID.get(id);
  return r ? { lat: r[3], lng: r[4] } : null;
}

/**
 * The cities at 0 under the ranked ones: every board city the server did
 * not send a row for, nearest first to `fromId` (the board city on your
 * profile, which is among them when it is not ranked yet), else A to Z.
 * Nothing about a city's own activity can move it: it is not known here.
 */
export function zeroCities(rankedIds: ReadonlySet<string>, fromId: string | null): ZeroCity[] {
  const from = fromId ? BY_ID.get(fromId) ?? null : null;
  const rest = ROWS.filter((r) => !rankedIds.has(r[0]));
  const byName = (a: Row, b: Row) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
  if (from) {
    const spot = { lat: from[3], lng: from[4] };
    const miles = new Map(rest.map((r) => [r[0], milesBetween(spot, { lat: r[3], lng: r[4] })]));
    rest.sort((a, b) => miles.get(a[0])! - miles.get(b[0])! || byName(a, b));
  } else {
    rest.sort(byName);
  }
  return rest.map((r) => ({ id: r[0], name: r[1], region: r[2], zero: true }));
}
