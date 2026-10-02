import type { HitRequest } from '../types';
import { DEMO_PARK } from './courts';

const hoursFromNow = (h: number) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + h); return d.toISOString(); };
/** A few hours from now, but never before 7am: a demo opened after midnight still shows a hit at a sensible hour. */
const laterToday = (h: number) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(Math.max(d.getHours() + h, 7)); return d.toISOString(); };
const tomorrowAt = (hour: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const daysFromNowAt = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const at = (n: number) => { const c = DEMO_PARK(n); return { id: c.id, name: c.name ?? 'Public courts', lat: c.lat, lng: c.lng }; };

/**
 * Demo open hits, timed from when the demo loads, one for each case Find
 * Players and the map have to get right: two at demo parks near you (with
 * the court's id, so they show on its page), one at a place only typed (no
 * spot: it sits in the list without a distance), one in San Diego (under
 * "Further away"), and one by Ella, a teen, which an adult who does not
 * follow her must not see anywhere.
 */
export const demoHits: HitRequest[] = [
  { id: 'hit-demo-1', authorId: 'u-sam', startsAt: laterToday(3), place: at(1), levelMin: 3.5, levelMax: 4.5, format: 'singles', spots: 1, note: 'Lefty, steady rally pace. Bring balls if you have a fresh can.', createdAt: hoursFromNow(-2), joinedIds: [] },
  { id: 'hit-demo-2', authorId: 'u-marcus', startsAt: tomorrowAt(9), place: at(3), format: 'doubles', spots: 3, note: 'Easygoing doubles, all levels welcome.', createdAt: hoursFromNow(-5), joinedIds: ['u-sam'] },
  { id: 'hit-demo-3', authorId: 'u-priya', startsAt: daysFromNowAt(2, 18), place: { name: 'Oak Knoll school courts' }, levelMin: 4.0, levelMax: 5.0, format: 'hit', spots: 1, createdAt: hoursFromNow(-20), joinedIds: [] },
  { id: 'hit-demo-4', authorId: 'u-tomas', startsAt: daysFromNowAt(3, 8), place: { name: 'Harbor View Park', lat: 32.72, lng: -117.16 }, format: 'singles', spots: 1, note: 'In San Diego for the weekend.', createdAt: hoursFromNow(-30), joinedIds: [] },
  { id: 'hit-demo-5', authorId: 'u-ella', startsAt: laterToday(5), place: at(2), format: 'singles', spots: 1, createdAt: hoursFromNow(-1), joinedIds: [] },
];
