import { remote } from '@/data/remote';
import { supabase } from '@/lib/supabase';
import type { TrackerId } from '@/data/types';

/** The trackers the server's trackers function signs in to (migration 69). Here so the store can use them without importing a hook. */
export const TRACKERS: TrackerId[] = ['fitbit', 'oura', 'polar'];
export const isTracker = (p: string): p is TrackerId => (TRACKERS as string[]).includes(p);

/**
 * Whether tennis sessions from trackers are switched on for you.
 *
 * The server decides, per source: 'flag:tennis-apple' and 'flag:tennis-whoop'
 * in server_settings are 'off', 'admins' (only admin accounts, for testing)
 * or 'on' (migration 58); 'flag:tennis-fitbit', '-oura' and '-polar' the
 * same (migration 69). They ship 'off', and a database without migration
 * 58 has no such switches at all, so until one is turned on nothing new
 * shows anywhere in the app.
 *
 * The demo build (no Supabase, or a demo account) has them on, so the whole
 * flow can be seen and worked on without a tracker.
 *
 * The hook that screens use is in ./useTennisFlags, kept apart so the store
 * can use this file without importing itself.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Asked again after a few minutes, so a switch flipped mid-session is noticed. */
const RECHECK_MS = 5 * 60 * 1000;

/**
 * One per source for tennis, plus `workoutsApple`: every other workout from
 * Apple Health (a run, a lift, a ride…), 'flag:workouts-apple' (migration
 * 107; owner, Oct 5). Absent on a database before 107, so off there.
 */
export type TennisFlags = { apple: boolean; whoop: boolean; fitbit: boolean; oura: boolean; polar: boolean; workoutsApple: boolean };
export const NO_FLAGS: TennisFlags = { apple: false, whoop: false, fitbit: false, oura: false, polar: false, workoutsApple: false };
const OFF = NO_FLAGS;
const DEMO: TennisFlags = { apple: true, whoop: true, fitbit: true, oura: true, polar: true, workoutsApple: true };

let known: { me: string; flags: TennisFlags; at: number } | null = null;
let asking: { me: string; answer: Promise<TennisFlags> } | null = null;

/** True for the demo: no database, or an account that is one of the fixtures. */
export const isDemo = (me: string | null) => !supabase || (!!me && !UUID.test(me));

/** The last answer for this account, if there is one, without asking. */
export function knownTennisFlags(me: string | null): TennisFlags | null {
  if (isDemo(me)) return DEMO;
  return known && known.me === me ? known.flags : null;
}

export function tennisFlags(me: string | null): Promise<TennisFlags> {
  if (isDemo(me)) return Promise.resolve(DEMO);
  // Signed out: nothing is on.
  if (!me) return Promise.resolve(OFF);
  if (known && known.me === me && Date.now() - known.at < RECHECK_MS) return Promise.resolve(known.flags);
  if (asking && asking.me === me) return asking.answer;
  const answer = remote.myFlags()
    .then((f) => ({ apple: f['tennis-apple'] === true, whoop: f['tennis-whoop'] === true, fitbit: f['tennis-fitbit'] === true, oura: f['tennis-oura'] === true, polar: f['tennis-polar'] === true, workoutsApple: f['workouts-apple'] === true }))
    .catch(() => OFF)
    .then((flags) => {
      known = { me, flags, at: Date.now() };
      if (asking?.me === me) asking = null;
      return flags;
    });
  asking = { me, answer };
  return answer;
}
