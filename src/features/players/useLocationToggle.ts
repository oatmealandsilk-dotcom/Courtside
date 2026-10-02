import { useState } from 'react';
import type { MapVisibility } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { show as showToast } from '@/lib/toast';
import { askWhoSeesYou, canChooseVisibility, dismissHideTip, showHideTip, type TipSpot } from '@/features/players/mapPrivacy';

/**
 * The map's Location switch. Turning it on asks the device where it is,
 * which can take a few seconds or be refused; the switch says "Finding
 * you…" while it asks, and a refusal is said out loud instead of the
 * switch quietly staying off.
 *
 * With the map's round 2 on the database (migration 63), someone who has
 * never said who can see them on the map is asked that first ("Who can see
 * you on the map?"), then the device's own prompt, then one tip by this
 * button: "Tap here any time to hide yourself." `where` says which button
 * that is. On the full map, the button with Location on opens the same
 * choices (and Location off) rather than switching straight off.
 */
export function useLocationToggle(where: TipSpot = 'card') {
  const { locationEnabled, actions, mapLive, mapVisibility, currentUser } = useApp();
  const [locating, setLocating] = useState(false);
  const choosing = canChooseVisibility(mapLive, currentUser);
  /** Never chosen who can see you: the screen comes first. */
  const mustChoose = choosing && mapVisibility === null;

  const switchOn = async (chose: MapVisibility | null) => {
    setLocating(true);
    try {
      const problem = await actions.setLocationEnabled(true);
      if (problem) showToast({ title: 'Location is still off', body: problem, icon: 'navigate-outline' });
      else if (chose) void showHideTip(where, chose);
    } finally {
      setLocating(false);
    }
  };

  const toggle = async () => {
    if (locating) return;
    dismissHideTip();
    if (locationEnabled) {
      if (where === 'map' && choosing) { await askWhoSeesYou('manage'); return; }
      void actions.setLocationEnabled(false);
      return;
    }
    let chose: MapVisibility | null = null;
    if (mustChoose) {
      // Closed without an answer: nothing changes, and it asks again next time.
      chose = await askWhoSeesYou('first');
      if (!chose) return;
    }
    await switchOn(chose);
  };

  /**
   * The full map, opened by someone who has never chosen: the screen, then
   * (only if Location was never asked) the device's prompt, then the tip.
   */
  const chooseFirst = async (ask: boolean): Promise<MapVisibility | null> => {
    const chose = await askWhoSeesYou('first');
    if (!chose) return null;
    if (locationEnabled || !ask) { void showHideTip(where, chose); return chose; }
    await switchOn(chose);
    return chose;
  };

  return { locationOn: locationEnabled, locating, toggle, mustChoose, chooseFirst };
}
