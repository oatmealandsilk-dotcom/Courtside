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

/**
 * Taps that answer sooner (Nov 2, owner: "There's also a delay on clicking buttons for them to
 * respond. Clicking should respond much faster"). He already had the quicker press feel above and
 * still felt the wait, which sat after the finger lifted, not in the press look:
 *   - Follow (the pill, the map card's round one, a player's page): it turns to Following or
 *     Requested at once, with the follower count beside it on a player's page, and the app's own
 *     redraw for the follow goes on as background work (it used to wait for every page in the app
 *     to redraw first); on the pill and the map card's, that redraw is sent once their change has
 *     played (useQuickFollow's settleMs), as sent at once it stalled the fade part way. Known cost, to weigh
 *     before this goes to everyone: for those 0.34 to 0.38 s only the tapped button (and a player page's count)
 *     has changed; the rest of the screen (the same person in another row, first-move's "Follow all" count,
 *     follower counts elsewhere, the ••• menus) catches up after. What decides from whom you follow
 *     does not wait for it: the follow is sent at once (flushQuickFollows) on first-move's Continue and Follow
 *     all, the map card's ⋯, a page opening over the button or the button leaving the screen, and the app being
 *     put away (so a follow is lost only if the app is killed outright in that third of a second). If anything
 *     else follows them meanwhile, the late follow changes nothing (followAsSeen), so it never undoes one;
 *   - Message on a player's page, when they can already be messaged: the chat opens at once,
 *     with no spinner drawn (and the whole page redrawn for it) first;
 *   - any page opening over the four main tabs: the Feed's shades (behind the clip words, the
 *     clip's top, a Discussions card's fade) are iOS's own gradient (ShadeGradient), which iOS
 *     does not repaint by hand as a page opens over them, so the slide starts sooner.
 * Each of these changes when things happen on an iPhone, which no web check can see, so admins
 * (@oatmealandsilk, @mrdinosaur62) get them first, like the quicker press feel. Turned on for
 * everyone by setting this to true and shipping an over-the-air update: no database change.
 * Not here: a tab tapped on the bar. Setting the row off in the tap itself was tried (Nov 2) and
 * the Simulator showed it moving no sooner: the animation thread holds the row's frames while the
 * app's redraw for the new address lands, and set off before that redraw, the Feed's slide moved
 * one frame and then stood still for a tenth of a second. Nor pages underneath: keeping a page
 * under the one on show from being redrawn each time a page opened or closed over it (Screen's key
 * held to the address it opened on) was tried (Nov 2) and showed no measurable gain, so it came out.
 */
export const TAP_FAST_FOR_EVERYONE = false;

/**
 * The simulator's proof only (simDriver's "tapfast on=0|1"): this build's answer, whoever is
 * signed in, so one build can be timed both ways. Null everywhere else (the switch and the admin flag decide).
 */
let tapFastForced: boolean | null = null;

/** Whether taps answer sooner right now. Read it when acting, not once at import. */
export const tapFastOn = (): boolean => tapFastForced ?? (TAP_FAST_FOR_EVERYONE || admin);

/** The simulator's proof only (see tapFastForced): on, off, or back to the switch (null). */
export function forceTapFast(on: boolean | null) {
  if (tapFastForced === on) return;
  tapFastForced = on;
  listeners.forEach((fn) => fn());
}

/** Whether taps answer sooner for this person; a component using it redraws if that changes. */
export function useTapFast(): boolean {
  return useSyncExternalStore(subscribe, tapFastOn, tapFastOn);
}
