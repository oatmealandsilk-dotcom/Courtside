import { remote } from '@/data/remote';
import { supabase } from '@/lib/supabase';

/**
 * Whether tennis sessions from trackers are switched on for you.
 *
 * The server decides, per source: 'flag:tennis-apple' and 'flag:tennis-whoop'
 * in server_settings are 'off', 'admins' (only admin accounts, for testing)
 * or 'on' (migration 58). They ship 'off', and a database without migration
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

export type TennisFlags = { apple: boolean; whoop: boolean };
const OFF: TennisFlags = { apple: false, whoop: false };
const DEMO: TennisFlags = { apple: true, whoop: true };

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
    .then((f) => ({ apple: f['tennis-apple'] === true, whoop: f['tennis-whoop'] === true }))
    .catch(() => OFF)
    .then((flags) => {
      known = { me, flags, at: Date.now() };
      if (asking?.me === me) asking = null;
      return flags;
    });
  asking = { me, answer };
  return answer;
}
