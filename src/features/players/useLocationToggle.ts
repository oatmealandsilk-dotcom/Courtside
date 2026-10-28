import { useCallback, useRef, useState } from 'react';
import type { MapVisibility } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { show as showToast } from '@/lib/toast';
import { askWhoSeesYou, dismissHideTip, onTeenMap, saidYes, showHideTip, type TipSpot } from '@/features/players/mapPrivacy';
import { liveCheckIn } from '@/features/players/checkIn';
import { lightUpCourtHere, litLine, litSpan, litTill } from '@/features/places/lightUp';
import { useOpenClock } from '@/features/players/useOpenClock';

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

/** What a Light up button shows and does (MapTopBar, the Find Players card). */
export interface CheckInControl {
  /** Lit up right now. */
  on: boolean;
  /** Asking the phone where it is, or the server. */
  busy: boolean;
  /** "till 10pm" (how long a light-up now would last, or how long yours still does). */
  span: string;
  /** When yours ends, while you are lit up. */
  until: string | null;
  press: () => void;
}

/**
 * Check in (migration 189, Apple 5.1.2(i)): the only way your spot is ever
 * shared. A tap reads the phone's location once and shows your pin to
 * friends who follow each other with you until 10pm (2 hours after 8pm);
 * then it goes by itself. Tapped again: Check out, gone at once. The first
 * time, "Who can see you on the map?" comes first (yes, or Not now: then
 * nothing happens), then Apple's own prompt. `where` says which button the
 * one tip after the first check-in points at.
 */
export function useCheckIn(where: TipSpot = 'card'): CheckInControl {
  const { actions, mapVisibility, lastSeen, currentUserId, currentUser, courtFacts } = useApp();
  const [busy, setBusy] = useState(false);
  const mine = currentUserId ? lastSeen[currentUserId]?.until : undefined;
  // Looks again the moment your check-in ends, so the button says Check in again by itself.
  const now = useOpenClock(mine ? [mine] : []);
  const until = liveCheckIn(lastSeen, currentUserId, now);

  const pressNow = async () => {
    if (busy) return;
    dismissHideTip();
    if (until) { await actions.checkOutOfMap(); return; }
    let first = false;
    if (!saidYes(mapVisibility)) {
      // Not now, or closed: nothing is shared, and it asks again next time.
      const chose = await askWhoSeesYou('first');
      if (!saidYes(chose)) return;
      first = true;
    }
    setBusy(true);
    try {
      let at: { lat: number; lng: number } | null = null;
      const problem = await actions.checkInOnMap((fix) => { at = fix; });
      if (problem) { showToast({ title: 'Couldn’t light you up', body: problem, icon: 'navigate-outline' }); return; }
      // Standing at a court: it lights up too, from this same tap (Light up, admins first).
      const spot: { lat: number; lng: number } | null = at;
      const court = spot ? await lightUpCourtHere(spot, { me: currentUser, accessOf: (id) => courtFacts[id]?.access, checkIn: actions.checkInAtCourt }) : null;
      showToast({ title: litLine(litSpan()), body: court ? `${court} lights up too.` : 'Friends who follow you back can see you on the map.', icon: 'checkmark-circle-outline' });
      if (first) void showHideTip(where);
    } finally {
      setBusy(false);
    }
  };
  const ref = useRef(pressNow);
  ref.current = pressNow;
  const press = useCallback(() => { void ref.current(); }, []);

  return { on: !!until, busy, span: until ? litTill(until) : litSpan(), until, press };
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
