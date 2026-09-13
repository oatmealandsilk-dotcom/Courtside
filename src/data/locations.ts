/**
 * The place bank. Typing a city offers these; turning Location on picks the
 * nearest one to where the device says you are. A real build would ask a
 * places service instead — this list is the shape of that, kept small enough
 * to read.
 */
export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export const PLACES: Place[] = [
  { name: 'Los Angeles, CA', lat: 34.05, lng: -118.24 },
  { name: 'San Diego, CA', lat: 32.72, lng: -117.16 },
  { name: 'San Francisco, CA', lat: 37.77, lng: -122.42 },
  { name: 'Palo Alto, CA', lat: 37.44, lng: -122.14 },
  { name: 'Indian Wells, CA', lat: 33.72, lng: -116.34 },
  { name: 'Sacramento, CA', lat: 38.58, lng: -121.49 },
  { name: 'Phoenix, AZ', lat: 33.45, lng: -112.07 },
  { name: 'Las Vegas, NV', lat: 36.17, lng: -115.14 },
  { name: 'Seattle, WA', lat: 47.61, lng: -122.33 },
  { name: 'Portland, OR', lat: 45.52, lng: -122.68 },
  { name: 'Denver, CO', lat: 39.74, lng: -104.99 },
  { name: 'Salt Lake City, UT', lat: 40.76, lng: -111.89 },
  { name: 'Austin, TX', lat: 30.27, lng: -97.74 },
  { name: 'Dallas, TX', lat: 32.78, lng: -96.8 },
  { name: 'Houston, TX', lat: 29.76, lng: -95.37 },
  { name: 'San Antonio, TX', lat: 29.42, lng: -98.49 },
  { name: 'Chicago, IL', lat: 41.88, lng: -87.63 },
  { name: 'Minneapolis, MN', lat: 44.98, lng: -93.27 },
  { name: 'Detroit, MI', lat: 42.33, lng: -83.05 },
  { name: 'Cincinnati, OH', lat: 39.1, lng: -84.51 },
  { name: 'Columbus, OH', lat: 39.96, lng: -83.0 },
  { name: 'Nashville, TN', lat: 36.16, lng: -86.78 },
  { name: 'Atlanta, GA', lat: 33.75, lng: -84.39 },
  { name: 'Charlotte, NC', lat: 35.23, lng: -80.84 },
  { name: 'Raleigh, NC', lat: 35.78, lng: -78.64 },
  { name: 'Miami, FL', lat: 25.76, lng: -80.19 },
  { name: 'Orlando, FL', lat: 28.54, lng: -81.38 },
  { name: 'Tampa, FL', lat: 27.95, lng: -82.46 },
  { name: 'Delray Beach, FL', lat: 26.46, lng: -80.07 },
  { name: 'Washington, DC', lat: 38.91, lng: -77.04 },
  { name: 'Philadelphia, PA', lat: 39.95, lng: -75.17 },
  { name: 'Pittsburgh, PA', lat: 40.44, lng: -79.99 },
  { name: 'New York, NY', lat: 40.71, lng: -74.01 },
  { name: 'Brooklyn, NY', lat: 40.68, lng: -73.94 },
  { name: 'Boston, MA', lat: 42.36, lng: -71.06 },
  { name: 'Newport, RI', lat: 41.49, lng: -71.31 },
  { name: 'Toronto, ON', lat: 43.65, lng: -79.38 },
  { name: 'Montreal, QC', lat: 45.5, lng: -73.57 },
  { name: 'Vancouver, BC', lat: 49.28, lng: -123.12 },
  { name: 'Mexico City, MX', lat: 19.43, lng: -99.13 },
  { name: 'London, UK', lat: 51.51, lng: -0.13 },
  { name: 'Wimbledon, UK', lat: 51.42, lng: -0.21 },
  { name: 'Manchester, UK', lat: 53.48, lng: -2.24 },
  { name: 'Dublin, IE', lat: 53.35, lng: -6.26 },
  { name: 'Paris, FR', lat: 48.86, lng: 2.35 },
  { name: 'Lyon, FR', lat: 45.76, lng: 4.84 },
  { name: 'Madrid, ES', lat: 40.42, lng: -3.7 },
  { name: 'Barcelona, ES', lat: 41.39, lng: 2.17 },
  { name: 'Lisbon, PT', lat: 38.72, lng: -9.14 },
  { name: 'Rome, IT', lat: 41.9, lng: 12.5 },
  { name: 'Milan, IT', lat: 45.46, lng: 9.19 },
  { name: 'Berlin, DE', lat: 52.52, lng: 13.41 },
  { name: 'Munich, DE', lat: 48.14, lng: 11.58 },
  { name: 'Hamburg, DE', lat: 53.55, lng: 9.99 },
  { name: 'Amsterdam, NL', lat: 52.37, lng: 4.9 },
  { name: 'Brussels, BE', lat: 50.85, lng: 4.35 },
  { name: 'Zurich, CH', lat: 47.38, lng: 8.54 },
  { name: 'Geneva, CH', lat: 46.2, lng: 6.14 },
  { name: 'Vienna, AT', lat: 48.21, lng: 16.37 },
  { name: 'Stockholm, SE', lat: 59.33, lng: 18.07 },
  { name: 'Copenhagen, DK', lat: 55.68, lng: 12.57 },
  { name: 'Athens, GR', lat: 37.98, lng: 23.73 },
  { name: 'Istanbul, TR', lat: 41.01, lng: 28.98 },
  { name: 'Dubai, AE', lat: 25.2, lng: 55.27 },
  { name: 'Doha, QA', lat: 25.29, lng: 51.53 },
  { name: 'Mumbai, IN', lat: 19.08, lng: 72.88 },
  { name: 'Delhi, IN', lat: 28.61, lng: 77.21 },
  { name: 'Bangalore, IN', lat: 12.97, lng: 77.59 },
  { name: 'Singapore, SG', lat: 1.35, lng: 103.82 },
  { name: 'Hong Kong, HK', lat: 22.32, lng: 114.17 },
  { name: 'Shanghai, CN', lat: 31.23, lng: 121.47 },
  { name: 'Beijing, CN', lat: 39.9, lng: 116.4 },
  { name: 'Tokyo, JP', lat: 35.68, lng: 139.69 },
  { name: 'Osaka, JP', lat: 34.69, lng: 135.5 },
  { name: 'Seoul, KR', lat: 37.57, lng: 126.98 },
  { name: 'Sydney, AU', lat: -33.87, lng: 151.21 },
  { name: 'Melbourne, AU', lat: -37.81, lng: 144.96 },
  { name: 'Brisbane, AU', lat: -27.47, lng: 153.03 },
  { name: 'Perth, AU', lat: -31.95, lng: 115.86 },
  { name: 'Auckland, NZ', lat: -36.85, lng: 174.76 },
  { name: 'Johannesburg, ZA', lat: -26.2, lng: 28.05 },
  { name: 'Cape Town, ZA', lat: -33.92, lng: 18.42 },
  { name: 'São Paulo, BR', lat: -23.55, lng: -46.63 },
  { name: 'Rio de Janeiro, BR', lat: -22.91, lng: -43.17 },
  { name: 'Buenos Aires, AR', lat: -34.6, lng: -58.38 },
  { name: 'Santiago, CL', lat: -33.45, lng: -70.67 },
  { name: 'Bogotá, CO', lat: 4.71, lng: -74.07 },
];

/** Prefix matches first ("aus" → Austin before Los Angeles), then anywhere. */
export function searchPlaces(query: string, limit = 5): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = PLACES.filter((p) => p.name.toLowerCase().startsWith(q));
  const within = PLACES.filter((p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q));
  return [...starts, ...within].slice(0, limit);
}

/** Closest entry to a coordinate. Good enough for "which city am I in". */
export function nearestPlace(lat: number, lng: number): Place {
  let best = PLACES[0];
  let bestDistance = Infinity;
  for (const place of PLACES) {
    const dLat = place.lat - lat;
    const dLng = (place.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  return best;
}
