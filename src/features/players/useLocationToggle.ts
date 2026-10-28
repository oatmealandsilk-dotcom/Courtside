import { useCallback, useRef, useState } from 'react';
import type { MapVisibility } from '@/data/types';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { show as showToast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { askWhoSeesYou, dismissHideTip, onTeenMap, saidYes, showHideTip, type TipSpot } from '@/features/players/mapPrivacy';
import { liveCheckIn } from '@/features/players/checkIn';
import { lightUpCourtHere, litLine, litSpan, litTill } from '@/features/places/lightUp';
import { useOpenClock } from '@/features/players/useOpenClock';
import { afterLanding, swoopAsks, swoopFinding, swoopFound } from '@/features/players/checkInZoom';
import type { LatLng } from '@/features/players/positions';

/**
 * Location on this phone (Settings, "Use my location"): where you are, for
 * the courts near you and where the map opens. Since migration 189 it is
 * never sent anywhere on its own; only Check in (useCheckIn) shares a spot.
 * Turning it on asks the device, which can take a few seconds or be
 * refused; "Finding you…" while it asks, and a refusal is said out loud.
 * Turning it off also checks you out.
 */
export function useLocationToggle() {
  const { locationEnabled, actions } = useApp();
  const [locating, setLocating] = useState(false);

  const toggleNow = async () => {
    if (locating) return;
    if (locationEnabled) { void actions.setLocationEnabled(false); return; }
    setLocating(true);
    try {
      const problem = await actions.setLocationEnabled(true);
      if (problem) showToast({ title: 'Location is still off', body: problem, icon: 'navigate-outline' });
    } finally {
      setLocating(false);
    }
  };

  // One function for the life of the screen that always runs the latest toggle, so a row handed it
  // (UpToday, memoised) is not redrawn on every render of its page.
  const toggleRef = useRef(toggleNow);
  toggleRef.current = toggleNow;
  const toggle = useCallback(() => toggleRef.current(), []);

  return { locationOn: locationEnabled, locating, toggle };
}

/** What the Up to hit button shows and does (MapTopBar, the Find Players card). */
export interface CheckInControl {
  /** Lit up right now. */
  on: boolean;
  /** Asking the phone where it is, or the server. */
  busy: boolean;
  /** "till 10pm" (how long a light-up now would last, or how long yours still does). */
  span: string;
  /** When yours ends, while you are up to hit. */
  until: string | null;
  /** Counts the taps that could not put you up (location refused, the server said no): each one shakes the button once. */
  failed: number;
  press: () => void;
}

/**
 * How long the "Up to hit · till 10pm" toast waits after you are up, so the button's own moment
 * (UpToHit: the green sweeping in, the tick, the arrow's bounce, your pin landing, about 400 ms) is
 * seen first, before the toast slides in over the top of the map (Oct 28, owner: "be more gratifying").
 */
const TOAST_AFTER_MS = 450;
/**
 * And "Couldn't put you up to hit" waits out the button's shake (UpToHit, 280 ms): on the full map the toast
 * comes down over the round arrow, which would hide the shake (the warning tap on the hand comes at once).
 */
const FAIL_TOAST_AFTER_MS = 280;

/** What the check-in zoom (checkInZoom) hears from a tap of Up to hit, when it is on for you. */
export interface CheckInZoomHooks {
  /**
   * Told where you are the moment you are up (never before both questions, never on a refusal or a failure, never on
   * turning it off); true when it opened the full map (the tip then points at the full map's round arrow).
   */
  up: (at: LatLng) => boolean;
  /**
   * You said yes to "Who can see you on the map?" (or had before) and finding you starts: the card asks for the streets
   * of the full map's first view ahead (its own town, the one it shows: nothing of where you are), so it draws sooner.
   */
  finding?: () => void;
  /**
   * You said yes to "Who can see you on the map?" and the phone to its own question (or both had before), and it is
   * finding you now: the card readies its grow (mapGrow's pictures, taken while you wait). Never before both.
   */
  allowed?: () => void;
  /** The tap is over, however it went: anything readied and not used is let go. */
  over?: () => void;
}

/**
 * Check in (migration 189, Apple 5.1.2(i)): the only way your spot is ever
 * shared. A tap reads the phone's location once and shows your pin to
 * friends who follow each other with you until 10pm (2 hours after 8pm);
 * then it goes by itself. Tapped again: Check out, gone at once. The first
 * time, "Who can see you on the map?" comes first (yes, or Not now: then
 * nothing happens), then Apple's own prompt. `where` says which button the
 * one tip after the first check-in points at. In the full map ('map') the
 * button is the round arrow, which also reads as "find me": after the first
 * time a one-line question comes first (Oct 27 audit #11), so a tap meant to
 * recentre never shows you to anyone.
 *
 * `zoom`: the check-in zoom (checkInZoom), when it is on for you (CheckInZoomHooks).
 */
export function useCheckIn(where: TipSpot = 'card', zoom?: CheckInZoomHooks): CheckInControl {
  const { actions, mapVisibility, lastSeen, currentUserId, currentUser, courtFacts } = useApp();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  // Each tap's turn: a toast still waiting says nothing once a later tap (Up to hit off again) has come.
  const turn = useRef(0);
  // The latest, read when you are up (seconds after the tap, maybe).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const mine = currentUserId ? lastSeen[currentUserId]?.until : undefined;
  // Looks again the moment your check-in ends, so the button says Check in again by itself.
  const now = useOpenClock(mine ? [mine] : []);
  const until = liveCheckIn(lastSeen, currentUserId, now);

  const pressNow = async () => {
    if (busy) return;
    const tap = ++turn.current;
    dismissHideTip();
    if (until) { await actions.checkOutOfMap(); return; }
    let first = false;
    if (!saidYes(mapVisibility)) {
      // Not now, or closed: nothing is shared, and it asks again next time.
      const chose = await askWhoSeesYou('first');
      if (!saidYes(chose)) return;
      first = true;
    } else if (where === 'map') {
      // The round arrow: "Up to hit?" first, every time (the first time, the question above was it).
      const yes = await new Promise<boolean>((resolve) => confirm({
        title: 'Up to hit?',
        message: `Friends who follow you back see where you are ${litSpan()}.`,
        confirmLabel: 'Up to hit',
        cancelLabel: 'Not now',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      }));
      if (!yes) return;
    }
    // The zoom on: an open full map holds your pin, and stays where it is, while you are found.
    const zooming = !!zoomRef.current;
    if (zooming) { swoopFinding(); zoomRef.current?.finding?.(); }
    setBusy(true);
    try {
      let at: { lat: number; lng: number } | null = null;
      // Both questions said yes and the phone finding you: the card readies its grow meanwhile (never before).
      const allowed = () => { if (turn.current === tap) zoomRef.current?.allowed?.(); };
      const problem = await actions.checkInOnMap((fix) => { at = fix; }, zooming ? allowed : undefined);
      // It could not put you up: the button shakes once (UpToHit), the hand feels the same, and the toast says why.
      if (problem) {
        setFailed((n) => n + 1);
        haptics.reject();
        setTimeout(() => { if (turn.current === tap) showToast({ title: 'Couldn’t put you up to hit', body: problem, icon: 'navigate-outline' }); }, FAIL_TOAST_AFTER_MS);
        return;
      }
      const upAt = Date.now();
      const spot: { lat: number; lng: number } | null = at;
      // The check-in zoom: the full map swoops down to you (opening first, from the card).
      const asks = swoopAsks();
      const opened = spot && turn.current === tap ? zoomRef.current?.up(spot) ?? false : false;
      // A swoop set off: the toast and the one tip wait for your pin to land, so nothing slides in over the top mid-swoop.
      // Listened for now, before the court below is looked up: a short swoop can land first.
      const landing = swoopAsks() !== asks ? new Promise<void>((done) => afterLanding(done)) : null;
      // Standing at a court: it lights up too, from this same tap (courts lighting up, admins first).
      const court = spot ? await lightUpCourtHere(spot, { me: currentUser, accessOf: (id) => courtFacts[id]?.access, checkIn: actions.checkInAtCourt }) : null;
      const say = () => { if (turn.current === tap) showToast({ title: litLine(litSpan()), body: court ? `${court} shows you’re here too.` : 'Friends who follow you back can see you on the map.', icon: 'checkmark-circle-outline' }); };
      const tip = () => { if (first) void showHideTip(opened ? 'map' : where); };
      if (landing) {
        void landing.then(() => { setTimeout(say, TOAST_AFTER_MS); tip(); });
        return;
      }
      const wait = TOAST_AFTER_MS - (Date.now() - upAt);
      if (wait > 0) setTimeout(say, wait);
      else say();
      tip();
    } finally {
      if (zooming) { swoopFound(); zoomRef.current?.over?.(); }
      setBusy(false);
    }
  };
  const ref = useRef(pressNow);
  ref.current = pressNow;
  const press = useCallback(() => { void ref.current(); }, []);

  return { on: !!until, busy, span: until ? litTill(until) : litSpan(), until, failed, press };
}

/**
 * The "Open to hit today" switch (the Open to hit row, your card on the map).
 * Someone not known to be an adult who has never said who can see them on
 * the map (migration 78) gets the same question first, with its short
 * notice, so their ring is never shared before they choose; closed without
 * an answer, the switch stays off. Everyone else: straight through.
 * `edit`: Save in the hold-to-edit sheet, which turns the ring on until the
 * time picked, with the distance picked (the same question first). Resolves
 * false when the ring did not go on.
 */
export function useOpenToHitToggle() {
  const { actions, mapLive, mapVisibility, currentUser, teenMap } = useApp();
  const now = async (on: boolean, edit?: { until: string; miles: number | null }): Promise<boolean> => {
    if (on && mapLive === true && mapVisibility === null && onTeenMap(currentUser, teenMap)) {
      const chose = await askWhoSeesYou('first');
      if (!chose) return false;
    }
    if (on && edit) actions.editOpenToHit(edit.until, edit.miles);
    else actions.setOpenToHit(on);
    return true;
  };
  // The same function every render, always running the latest closure (see toggle above).
  const ref = useRef(now);
  ref.current = now;
  return useCallback((on: boolean, edit?: { until: string; miles: number | null }) => ref.current(on, edit), []);
}
