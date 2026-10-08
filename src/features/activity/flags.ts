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
 * 107; owner, Oct 5), and `workoutsWhoop`, the same from WHOOP,
 * 'flag:workouts-whoop' (migration 135). Absent on a database without them,
 * so off there.
 *
 * Not about trackers, but read the same way: `courtKings`, King of the
 * Court on a court's page, 'flag:court-kings' (migration 140). Held back
 * until after launch (owner, Oct 6: boards look empty with few players), so
 * it starts 'admins'. Off when the server can't be asked, and off in the
 * demo, which has no admin account.
 *
 * And `instants`: Instants, the 24-hour photos (owner, Oct 8: "Ship calories
 * hide instants"; 2 people posted 4 in 14 days). 'flag:instants'. No
 * migration adds it: a database without the key reads off, so Instants are
 * hidden everywhere until it is put in (features/stories/instantsSwitch).
 * Hidden in the demo too.
 */
export type TennisFlags = { apple: boolean; whoop: boolean; fitbit: boolean; oura: boolean; polar: boolean; workoutsApple: boolean; workoutsWhoop: boolean; courtKings: boolean; instants: boolean };
export const NO_FLAGS: TennisFlags = { apple: false, whoop: false, fitbit: false, oura: false, polar: false, workoutsApple: false, workoutsWhoop: false, courtKings: false, instants: false };
const OFF = NO_FLAGS;
const DEMO: TennisFlags = { apple: true, whoop: true, fitbit: true, oura: true, polar: true, workoutsApple: true, workoutsWhoop: true, courtKings: false, instants: false };

/** The last answer, per account. `failed`: the server could not be asked, and OFF stands in for it. */
type Known = { me: string; flags: TennisFlags; at: number; failed: boolean };
let known: Known | null = null;
let asking: { me: string; answer: Promise<Known> } | null = null;

/** True for the demo: no database, or an account that is one of the fixtures. */
export const isDemo = (me: string | null) => !supabase || (!!me && !UUID.test(me));

/** The last answer for this account, if there is one, without asking. */
export function knownTennisFlags(me: string | null): TennisFlags | null {
  if (isDemo(me)) return DEMO;
  return known && known.me === me ? known.flags : null;
}

const toFlags = (f: Record<string, boolean>): TennisFlags => ({ apple: f['tennis-apple'] === true, whoop: f['tennis-whoop'] === true, fitbit: f['tennis-fitbit'] === true, oura: f['tennis-oura'] === true, polar: f['tennis-polar'] === true, workoutsApple: f['workouts-apple'] === true, workoutsWhoop: f['workouts-whoop'] === true, courtKings: f['court-kings'] === true, instants: f.instants === true });

/** The server's answer, kept for a few minutes; `usable` says whether a kept one will do. */
function ask(me: string, usable: (k: Known) => boolean): Promise<Known> {
  if (known && known.me === me && Date.now() - known.at < RECHECK_MS && usable(known)) return Promise.resolve(known);
  if (asking && asking.me === me) return asking.answer;
  const answer = remote.myFlags()
    .then((f): Known => (f ? { me, flags: toFlags(f), at: Date.now(), failed: false } : { me, flags: OFF, at: Date.now(), failed: true }))
    .catch((): Known => ({ me, flags: OFF, at: Date.now(), failed: true }))
    .then((k) => {
      known = k;
      if (asking?.me === me) asking = null;
      return k;
    });
  asking = { me, answer };
  return answer;
}

/** The switches; all off when the server could not be asked (kept that way for a few minutes, as always). */
export function tennisFlags(me: string | null): Promise<TennisFlags> {
  if (isDemo(me)) return Promise.resolve(DEMO);
  // Signed out: nothing is on.
  if (!me) return Promise.resolve(OFF);
  return ask(me, () => true).then((k) => k.flags);
}

/**
 * The switches as the server actually said them, or null when it could not
 * be asked (no signal at the court, airplane mode, a wake in the background
 * on a weak signal). For a step with a lasting effect, which must not take
 * "could not ask" for "off": useWorkoutWatch, whose stop forgets the phone's
 * whole record of workouts. A failed answer is never reused here: it asks again.
 */
export function tennisFlagsKnown(me: string | null): Promise<TennisFlags | null> {
  if (isDemo(me)) return Promise.resolve(DEMO);
  if (!me) return Promise.resolve(null);
  return ask(me, (k) => !k.failed).then((k) => (k.failed ? null : k.flags));
}
