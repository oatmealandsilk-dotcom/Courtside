import { useSyncExternalStore } from 'react';

import { SIM_DRIVER, simAction, simLog } from '@/lib/simDriver';
import { tapFastOn, useTapFast } from '@/features/navigation/pressV2';

/**
 * Things arrive instead of cutting in (Nov 4, owner: "the people in the up to hit bar don't load
 * in with good animation. Everything should load with good animation, nothing should just cut in").
 *
 * What it changes, only for what turns up AFTER a page is already on show (never what is in a
 * page's first frame, never on a tab swipe, a swipe back, a return to a page, a page opened again
 * or a theme change; see Arrive.tsx):
 *   - Up to hit's faces (and the regulars after them) arrive with a soft fade and a slight rise, a
 *     beat apart left to right; a face that goes fades out and the others glide over; the title,
 *     the "N near you" count and the empty line crossfade instead of swapping;
 *   - a face's photo crossfades over its coloured initials the first time it is shown this
 *     session, and is kept in memory, so a face seen before is there in the first frame;
 *   - the sections and rows that land after a page shows (People you may know, Your courts,
 *     a profile's grid, a thread's replies, notifications, the chats list, a court's page, search,
 *     the header badges, sheets) fade or fold in.
 *
 * Each of these changes how things move on an iPhone, which no web check can show, so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first, with the quicker taps (pressV2's TAP_FAST): on
 * whenever taps answer sooner, or for everyone once this is true (an over-the-air update; no
 * database change).
 */
export const LOAD_IN_FOR_EVERYONE = false;

/**
 * How Up to hit's faces arrive (Nov 4: three looks filmed side by side,
 * ~/Desktop/CourtSide-Nov4/load-in/up-to-hit-options.mp4). One line picks:
 *   'A' rise:  each face fades in as it rises 6 points and grows from 94%, 260 ms, 40 ms apart.
 *   'B' pop:   each face grows from 60% with a slight overshoot as it fades in, 320 ms, 50 ms apart.
 *   'C' slide: each face slides in 24 points from the right as it fades in, 280 ms, 30 ms apart.
 */
export const UP_ARRIVAL: 'A' | 'B' | 'C' = 'A';

/** The simulator's proof only (sim "loadin on=0|1|switch look=A|B|C"): this build's answer, whoever is signed in. */
let forced: boolean | null = null;
let forcedLook: 'A' | 'B' | 'C' | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Whether things arrive (rather than cut in) for this person right now. Read it when acting. */
export const loadInOn = (): boolean => forced ?? (LOAD_IN_FOR_EVERYONE || tapFastOn());

/** The same, for a component that should redraw if it changes (sign-in telling the app you are an admin). */
export function useLoadIn(): boolean {
  // Listening to the quicker taps' own switch too, so the admin flag landing redraws this.
  useTapFast();
  return useSyncExternalStore(subscribe, loadInOn, loadInOn);
}

/** Up to hit's look (UP_ARRIVAL, or the simulator's pick). */
export const upArrival = (): 'A' | 'B' | 'C' => forcedLook ?? UP_ARRIVAL;

/**
 * The simulator's proof only: Up to hit held to its first `people` players, and its regulars held back (fill=0), until
 * a later "loadin up=all&fill=1" lets them in, so every look is filmed with the same faces arriving at the same moment
 * (the demo's own row is all there from the start). Null: the row as it is.
 */
let simUp: { people: number; fill: boolean } | null = null;
export const simUpNow = () => simUp;
export function useSimUp() {
  return useSyncExternalStore(subscribe, simUpNow, simUpNow);
}

const simSet = (q: Record<string, string>) => {
  if (q.on !== undefined) forced = q.on === '1' ? true : q.on === '0' ? false : null;
  if (q.look === 'A' || q.look === 'B' || q.look === 'C') forcedLook = q.look;
  if (q.up !== undefined || q.fill !== undefined) {
    const people = q.up === 'all' ? 99 : q.up !== undefined ? Number(q.up) || 0 : simUp?.people ?? 99;
    const fill = q.fill !== undefined ? q.fill === '1' : simUp?.fill ?? true;
    simUp = people >= 99 && fill ? null : { people, fill };
  }
  simLog(`[sim] loadin on=${forced ?? 'switch'} look=${upArrival()} up=${simUp ? `${simUp.people}/${simUp.fill ? 'fill' : 'nofill'}` : 'all'}`);
  listeners.forEach((fn) => fn());
};
simAction('loadin', simSet);
// The same, read once as the app starts from Documents/sim-loadin.txt ("on=0&look=B"), so a cold open is timed with the
// setting it is meant to show from its very first frame (a command arrives only once the app is up and polling).
if (SIM_DRIVER) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const f = new File(Paths.document, 'sim-loadin.txt');
    if (f.exists) simSet(Object.fromEntries(f.textSync().trim().split('&').map((kv) => kv.split('=') as [string, string])));
  } catch { /* the switch then */ }
}
