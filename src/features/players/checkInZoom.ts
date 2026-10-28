import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { User } from '@/data/types';
import type { LatLng } from '@/features/players/positions';
import { SWOOPS, SWOOP_KINDS, type SwoopKind, type SwoopShape } from '@/components/map/swoop';
import { useApp } from '@/store/AppContext';

/*
 * The check-in zoom (Oct 28, owner: "I feel like if you click the check in button. It would be cool if
 * it zoomed you into the map and centered yourself in the full screen"; of the feel: "like if your in a
 * rollar coaster pov or like a jets pov taking off").
 *
 *  - Up to hit on the Find Players card (or the For you copy of it): once you are up (your location
 *    found, the server said yes), the full map opens, the way a tap on the card opens it (the same
 *    page pushed on, nothing new), and its camera swoops down from your town to street level over you
 *    (swoop.ts: one move, the map tipping forward into perspective on the way and lying flat and north
 *    up again as it arrives). Your pin lands (the Up to hit drop and its one ring) as the camera settles.
 *  - The round arrow inside the full map: the camera swoops to you the same way, from wherever the map is.
 *  - Turning it off never opens or moves anything. Location refused or failed, "Not now" on "Who can
 *    see you on the map?", or the server saying no: nothing opens (the button's shake and the toast,
 *    as before). The first time, "Who can see you on the map?" and then Apple's prompt come exactly as
 *    they always have (Apple 5.1.2(i)): the zoom only ever starts after both.
 *  - A teen: the same, on themselves.
 *  - Reduce Motion (the system's own setting): the full map opens straight onto you, close in, no swoop.
 *
 * How close it comes: zoom 15¼, just past the street level a court opened from a post uses (15). On a
 * phone that is about 1.3 km across and 2.8 km top to bottom (ten or so city blocks each way): your
 * own streets with their names, the courts round you as pins of their own rather than numbers, and
 * anyone checked in at your court ringing round you (from 15 in, pinEngine). The quarter past 15 is
 * so the houses (drawn from 15 in: look.ts) come in while the camera is still on its way down, not
 * all at once in the moment it comes to rest.
 *
 * Admins first (CHECKIN_ZOOM_FOR_EVERYONE), so the owner can try it on his own iPhone before anyone
 * else; for everyone by setting the switch to true and shipping an over-the-air update (no database
 * change, no new native code). In the web demo, ?admin=1 makes the demo's player an admin, and
 * ?swoop=dive|bank|takeoff (or localStorage courtside-swoop) picks the swoop to compare them.
 */
export const CHECKIN_ZOOM_FOR_EVERYONE = false;

/** Whether Up to hit zooms you in for this person: everyone once released, admins until then. */
export const checkInZoomOn = (me: User | null | undefined): boolean => CHECKIN_ZOOM_FOR_EVERYONE || !!me?.isAdmin;

/** The same, for a screen. */
export function useCheckInZoom(): boolean {
  const { currentUser } = useApp();
  return checkInZoomOn(currentUser);
}

/** How close the camera comes down: street level (see above). */
export const CHECKIN_ZOOM = 15.25;

/** The swoop everyone gets: "bank", the dive with a gentle turn, the most like a ride of the three. */
export const SWOOP_DEFAULT: SwoopKind = 'bank';

/** The swoop to make: the default, or (web demo only, to compare them) ?swoop= or localStorage courtside-swoop. */
export function swoopShape(): SwoopShape {
  let kind: SwoopKind = SWOOP_DEFAULT;
  if (Platform.OS === 'web') {
    try {
      const asked = new URLSearchParams(window.location.search).get('swoop') ?? window.localStorage.getItem('courtside-swoop');
      if (asked && (SWOOP_KINDS as string[]).includes(asked)) kind = asked as SwoopKind;
    } catch { /* the default */ }
  }
  return SWOOPS[kind];
}

/* ------------------------------------------------------- the hand-over */

/** A swoop asked for: where to, and whether it opened the full map (from the card) or is for a map already open. */
export interface SwoopTo { id: number; to: LatLng; fresh: boolean; at: number }

/** A swoop asked for by the card is taken by the full map it opens, within this long; after, it is let go (never a surprise swoop later). */
const ASK_KEEP_MS = 6000;
/** Finding you never holds your pin back for longer than this (a check-in that never answered). */
const FINDING_MAX_MS = 30000;

let findingSince = 0;
let asked: SwoopTo | null = null;
let askIds = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Up to hit, with the zoom on, is finding you (after "Who can see you on the map?" said yes): an open full map holds your pin and stays where it is. */
export function swoopFinding() { findingSince = Date.now(); emit(); }
/** Finding you is over, however it went (a swoop asked for, or nothing). */
export function swoopFound() { if (!findingSince) return; findingSince = 0; emit(); }
/** You are up: the full map (open now, or about to be: `fresh`) swoops down to `to`. */
export function swoopTo(to: LatLng, fresh: boolean) { findingSince = 0; asked = { id: ++askIds, to, fresh, at: Date.now() }; emit(); }

/** The swoop waiting to be made, if it is still fresh. */
function peekAsk(): SwoopTo | null {
  return asked && Date.now() - asked.at <= ASK_KEEP_MS ? asked : null;
}
function takeAsk(): SwoopTo | null {
  const a = peekAsk();
  asked = null;
  return a;
}

/** What the full map does about it (useMapSwoop). */
export interface MapSwoop {
  /** The swoop to make now, once the map can (null: none). Made once per `id`. */
  run: SwoopTo | null;
  /** Your pin waits (a check-in finding you, or the camera on its way): 'keep' as it was, 'out' not yet on the map. */
  meHold: 'keep' | 'out' | null;
  /** Bumped as the camera settles: your pin lands (pinList's land). */
  land: number;
  /** Whether a check-in is finding you or the camera is on its way: the map stays where it is meanwhile (no move of its own to your new spot). */
  busy: boolean;
  /** The camera has come down on you (or was stopped): your pin lands. */
  done: () => void;
}

/**
 * The full map's side of the check-in zoom. `on`: the full map, with the zoom on for this person.
 * `pinNow`: whether your pin is on the map now (read until a check-in starts: it then stays as it
 * was, or stays off, until it lands).
 */
export function useMapSwoop(on: boolean, pinNow: boolean): MapSwoop {
  const v = useSyncExternalStore(subscribe, () => version, () => version);
  // Opened by the card: its swoop is there from the full map's first drawing, so your pin is never on it before it lands.
  const [run, setRun] = useState<SwoopTo | null>(() => (on ? peekAsk() : null));
  const [land, setLand] = useState(0);
  // Opened by the card (taken as it mounts) or the round arrow (taken as it comes).
  useEffect(() => {
    if (!on) return;
    const a = takeAsk();
    if (a) setRun(a);
  }, [on, v]);
  const done = useCallback(() => { setRun(null); setLand(Date.now()); }, []);
  // Never left waiting: a swoop that has not said it arrived (a page the phone stopped, a map that never drew) lands your pin anyway.
  const runId = run?.id;
  useEffect(() => {
    if (runId === undefined) return undefined;
    const t = setTimeout(done, 9000);
    return () => clearTimeout(t);
  }, [runId, done]);
  const finding = on && findingSince > 0 && Date.now() - findingSince < FINDING_MAX_MS;
  const busy = finding || (on && !!run);
  // Whether your pin was on the map as the wait began (it stays so until it lands).
  const had = useRef(pinNow);
  if (!busy) had.current = pinNow;
  const meHold = !busy ? null : run?.fresh ? 'out' : had.current ? 'keep' : 'out';
  return { run: on ? run : null, meHold, land, busy, done };
}
