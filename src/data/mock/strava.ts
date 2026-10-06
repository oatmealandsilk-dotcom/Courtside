import type { FlybyPerson, ID } from '../types';
import { DEMO_PARK } from './courts';

/*
 * The demo's stand-ins for migration 130 (King of the Court and Flyby), so
 * both show in the web demo (?as=you) without a database. Only the demo uses
 * any of this: with a database, court_kings() and flyby() answer.
 *
 * Alder Park (park 1) has a board: Mira 7 wins, Dev 5, Sam 4, Noor 3; your
 * own wins there come from your demo log (the matches logged "At Alder
 * Park"). Cypress Hollow (park 3) has nobody with a win yet, only regulars.
 * Today and yesterday at Alder Park, Noor and Jonah posted and Sam checked in
 * (anyone tagged on your own session that day is left out, as the server does).
 */

const daysAgo = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Wins at a demo court in the last 90 days, by player, with the day of the latest. */
export const DEMO_COURT_WINS: Record<string, { userId: ID; n: number; last: string }[]> = {
  [DEMO_PARK(1).id]: [
    { userId: 'u-mira', n: 7, last: daysAgo(2) },
    { userId: 'u-dev', n: 5, last: daysAgo(4) },
    { userId: 'u-sam', n: 4, last: daysAgo(6) },
    { userId: 'u-noor', n: 3, last: daysAgo(9) },
  ],
};

/** Days with a session posted at a demo court (the "Regulars" board). */
export const DEMO_COURT_REGULARS: Record<string, { userId: ID; n: number; last: string }[]> = {
  [DEMO_PARK(3).id]: [
    { userId: 'u-jonah', n: 12, last: daysAgo(1) },
    { userId: 'u-dev', n: 8, last: daysAgo(3) },
    { userId: 'u-sam', n: 5, last: daysAgo(5) },
  ],
};

/** Who else was at a demo court, by how many days ago. */
export const DEMO_FLYBY: Record<string, Record<number, FlybyPerson[]>> = {
  [DEMO_PARK(1).id]: {
    0: [
      { userId: 'u-noor', part: 'morning', via: 'post' },
      { userId: 'u-jonah', part: 'afternoon', via: 'post' },
      { userId: 'u-sam', part: 'evening', via: 'checkin' },
    ],
    1: [
      { userId: 'u-noor', part: 'morning', via: 'post' },
      { userId: 'u-jonah', part: 'afternoon', via: 'post' },
      { userId: 'u-sam', part: 'evening', via: 'checkin' },
    ],
  },
};
