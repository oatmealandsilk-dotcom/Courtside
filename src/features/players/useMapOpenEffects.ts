import { useEffect, useRef, useState } from 'react';

import { useWhoSeesYouUp } from '@/features/players/mapPrivacy';
import type { useLocationToggle } from '@/features/players/useLocationToggle';
import { useTip } from '@/features/tips/tips';
import { useApp } from '@/store/AppContext';

/**
 * What happens when the full map is opened, shared by the map page (app/map)
 * and the map window (MapLayer), which runs it only once its window has
 * finished opening (`settled`), so no sheet or prompt lands mid-motion.
 *
 * Opening the map is the moment to ask where you are: once, and only if you
 * have never chosen. Off, once chosen, stays off however the map is opened.
 * Never said who can see you on the map (migration 63)? That comes first,
 * with Location on already or never asked: then the device's own prompt
 * (if it was never asked), then the tip by the location button.
 */
export function useMapOpenEffects(location: ReturnType<typeof useLocationToggle>, settled: boolean) {
  const { currentUser, locationEnabled, locationAsked, actions, mapLive } = useApp();
  const asked = useRef(false);
  const { mustChoose, chooseFirst } = location;
  const [asking, setAsking] = useState(false);
  // Each open asks afresh (the map window stays made between opens, as the map page did not): dismissed without a
  // choice, it is asked again next time; once chosen, mustChoose and locationAsked keep it from asking.
  useEffect(() => { if (!settled) asked.current = false; }, [settled]);
  useEffect(() => {
    if (!settled) return;
    // Only once it is known whether there is a choice to make: who you are, and whether the database has it.
    if (asked.current || !currentUser || mapLive === null) return;
    if (mustChoose && (locationEnabled || locationAsked === false)) {
      asked.current = true;
      setAsking(true);
      void chooseFirst(locationAsked === false).finally(() => setAsking(false));
      return;
    }
    if (locationEnabled || locationAsked !== false) return;
    asked.current = true;
    void actions.setLocationEnabled(true);
  }, [settled, locationEnabled, locationAsked, actions, mustChoose, chooseFirst, currentUser, mapLive]);
  // The map's first pins wait while "Who can see you on the map?" is up (or
  // about to be), so their wave is seen, not played behind the sheet. Until
  // it is known whether there is anything to ask (a moment, at most 2.5 s)
  // they wait too.
  const sheetUp = useWhoSeesYouUp();
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  const willAsk = !asked.current && mustChoose && (locationEnabled || locationAsked === false);
  const holdPins = sheetUp || asking || willAsk || (mapLive === null && !waited);
  // Tip (features/tips): the top-right button is where who sees you is chosen; the switch on Community only turns it on and off.
  const whoTip = useTip('map-who-sees', settled && !!currentUser && !!location.locationOn && !holdPins);
  return { holdPins, whoTip };
}
