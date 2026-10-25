import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

/**
 * The quicker press feel (Oct 24, owner: "Buttons need to be way more responsive. They are way to
 * delayed when I click them"): a press look at 80 ms instead of 120 for a finger resting on a
 * button (swipePress), the dip landing in the very next frame (Tappable), a swiped-to section
 * taking taps the moment the finger lifts (SectionPager), a bar tap that no longer redraws both
 * tabs whole (tabFocus) with Community's out-of-sight switch back as background work (discuss),
 * and the heavier pages drawing their lower parts once they have slid in (court page, a player's
 * other grids, Your sessions) with Message asked ahead on a player's or coach's page.
 *
 * None of it can be tried on an iPhone before it ships (no simulator here), and web checks have
 * missed iPhone breakage before, so admins (@oatmealandsilk, @mrdinosaur62) get it first. Turned
 * on for everyone by setting this to true and shipping an over-the-air update: no database
 * change. In the web demo, ?admin=1 makes the demo's player an admin. The same pattern as
 * COMMENTS_V2_RELEASED.
 */
export const PRESS_V2_FOR_EVERYONE = false;

/**
 * Whether the signed-in person is an admin, as AppContext last said (setPressV2Admin), kept here
 * so code outside React (a press's timers, a section request) reads it at the moment it acts.
 */
let admin = false;
const listeners = new Set<() => void>();

/** Whether the quicker press feel is on right now. Read it when acting, not once at import. */
export const pressV2On = (): boolean => PRESS_V2_FOR_EVERYONE || admin;

/**
 * The same, for the animation thread. A worklet reads `pressV2Shared.value` when it runs, so a
 * gesture built before the answer came still follows it (never a plain variable captured then).
 */
export const pressV2Shared = makeMutable(PRESS_V2_FOR_EVERYONE);

/** Called by AppContext whenever the signed-in person's admin flag is known or changes (false when signed out). */
export function setPressV2Admin(isAdmin: boolean) {
  if (admin === isAdmin) return;
  admin = isAdmin;
  pressV2Shared.value = pressV2On();
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** Whether this person gets the quicker press feel; a component using it redraws if that changes. */
export function usePressV2(): boolean {
  return useSyncExternalStore(subscribe, pressV2On, pressV2On);
}
